import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ForgeEvent, SpawnAgentRequest } from '../../../src/shared/domain'
import { createForgeContext, disposeForgeContext, type ForgeContext } from '../../../electron/context'
import { AgentFactory } from '../../../electron/agents/agent-factory'
import { AgentRegistry } from '../../../electron/agents/agent-registry'
import { resolveRoleProfile } from '../../../electron/agents/agent-prompts/roles'
import { AgentRuntime, type AgentRuntimeConfig } from '../../../electron/agents/agent-runtime'
import { ModelGateway } from '../../../electron/models/model-gateway'
import { ProviderRegistry } from '../../../electron/models/provider-registry'
import { FakeProviderAdapter, type FakeProviderBehavior } from '../models/fake-provider'

interface Harness {
  context: ForgeContext
  dir: string
  gateway: ModelGateway
  fake: FakeProviderAdapter
  agentRegistry: AgentRegistry
  runtime: AgentRuntime
  events: ForgeEvent[]
  request(overrides?: Partial<SpawnAgentRequest>): SpawnAgentRequest
}

const harnesses: Harness[] = []

function createHarness(config: AgentRuntimeConfig = {}, behavior: FakeProviderBehavior = {}): Harness {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-m3-'))
  const context = createForgeContext(dir)
  context.repositories.projects.upsert({ id: 'project-1', name: 'Test', path: dir })
  context.repositories.workflows.create({ id: 'wf-1', projectId: 'project-1', objective: 'Test workflow' })

  const events: ForgeEvent[] = []
  context.events.on('*', (event) => events.push(event))

  const providers = new ProviderRegistry()
  const gateway = new ModelGateway(
    providers,
    context.repositories.modelSessions,
    context.events,
    context.logger,
    { maxAttempts: 1 }
  )
  const fake = new FakeProviderAdapter('fake', (event) => gateway.ingestProviderEvent(event), behavior)
  providers.register(fake)

  const agentRegistry = new AgentRegistry()
  const factory = new AgentFactory(context.repositories, gateway, context.events, context.logger)
  const runtime = new AgentRuntime(
    context.repositories,
    agentRegistry,
    factory,
    gateway,
    context.events,
    context.logger,
    config
  )

  const harness: Harness = {
    context,
    dir,
    gateway,
    fake,
    agentRegistry,
    runtime,
    events,
    request(overrides = {}) {
      return {
        workflowId: 'wf-1',
        role: 'research',
        objective: 'Inspect the repository',
        workingDirectory: dir,
        modelConfig: { providerId: 'fake', modelId: 'fake/free-model' },
        ...overrides,
      }
    },
  }
  harnesses.push(harness)
  return harness
}

afterEach(async () => {
  while (harnesses.length > 0) {
    const harness = harnesses.pop()!
    await harness.gateway.dispose()
    disposeForgeContext(harness.context)
    fs.rmSync(harness.dir, { recursive: true, force: true })
  }
})

function dynamicProfile(overrides: Record<string, unknown> = {}) {
  const profile = resolveRoleProfile('research')
  const { role: _role, ...rest } = profile
  void _role
  return { ...rest, ...overrides }
}

describe('AgentRuntime', () => {
  it('spawns an agent with an independent persisted model session', async () => {
    const { runtime, gateway, context, events, request } = createHarness()

    const agent = await runtime.spawn(request({ role: 'frontend' }))

    expect(agent.status).toBe('running')
    expect(agent.modelSessionId).toBeTruthy()
    const session = gateway.getSession(agent.modelSessionId!)
    expect(session?.agentId).toBe(agent.id)
    expect(session?.workflowId).toBe('wf-1')
    expect(context.repositories.agents.getById(agent.id)?.modelSessionId).toBe(agent.modelSessionId)

    const types = events.map((event) => event.type)
    expect(types).toContain('model:session-created')
    expect(types).toContain('agent:created')
    expect(types).toContain('agent:started')
  })

  it('enforces global concurrency limits', async () => {
    const { runtime, request } = createHarness({ maxConcurrentAgents: 1 })

    await runtime.spawn(request())
    await expect(runtime.spawn(request())).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('enforces recursion limits before creating any session', async () => {
    const { runtime, request, gateway } = createHarness()

    await expect(
      runtime.spawn(
        request({
          parentAgentId: 'missing-parent',
          dynamicProfile: dynamicProfile({
            executionLimits: { timeoutMs: 1000, tokenBudget: 100, maxRetries: 1, maxRecursionDepth: 1 },
          }),
        })
      )
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(gateway.listSessions()).toHaveLength(0)
  })

  it('records real provider usage and completes execution', async () => {
    const { runtime, fake, context, request } = createHarness({}, {
      onPrompt: (options, provider) => {
        provider.emitUsage(options.sessionId, {
          inputTokens: 12,
          outputTokens: 3,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        })
      },
    })

    const agent = await runtime.spawn(request())
    const completed = await runtime.execute(agent.id, 'Do the task')

    expect(completed.status).toBe('completed')
    expect(completed.tokensUsed).toBe(15)
    expect(context.repositories.agents.getById(agent.id)?.status).toBe('completed')
    expect(fake.submitCalls).toHaveLength(1)
    expect(fake.submitCalls[0]).toMatchObject({ agentId: agent.id, prompt: 'Do the task' })
  })

  it('fails an agent that exceeds its token budget', async () => {
    const { runtime, context, request } = createHarness({}, {
      onPrompt: (options, provider) => {
        provider.emitUsage(options.sessionId, {
          inputTokens: 50,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        })
      },
    })

    const agent = await runtime.spawn(
      request({
        dynamicProfile: dynamicProfile({
          executionLimits: { timeoutMs: 1000, tokenBudget: 10, maxRetries: 1, maxRecursionDepth: 1 },
        }),
      })
    )

    await expect(runtime.execute(agent.id, 'Exceed budget')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    expect(context.repositories.agents.getById(agent.id)?.status).toBe('failed')
    expect(context.repositories.agents.getById(agent.id)?.failureReason).toContain('Token budget exceeded')
  })

  it('detects stale running agents during sweeps', async () => {
    const { runtime, agentRegistry, request } = createHarness({ heartbeatTimeoutMs: 1000 })

    const agent = await runtime.spawn(request())
    const current = agentRegistry.require(agent.id)
    agentRegistry.register({ ...current, heartbeatAt: 0 })

    const stale = runtime.sweepStale()

    expect(stale.map((item) => item.id)).toContain(agent.id)
    expect(agentRegistry.require(agent.id).status).toBe('failed')
  })
})
