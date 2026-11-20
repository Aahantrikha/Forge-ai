import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AgentEvent } from '../../../src/shared/agent'
import { createForgeContext, disposeForgeContext, type ForgeContext } from '../../../electron/context'
import { ModelGateway, type ModelGatewayConfig } from '../../../electron/models/model-gateway'
import { ProviderRegistry } from '../../../electron/models/provider-registry'
import { FakeProviderAdapter, type FakeProviderBehavior } from './fake-provider'

interface Harness {
  context: ForgeContext
  dir: string
  gateway: ModelGateway
  registry: ProviderRegistry
  events: AgentEvent[]
  provider(id: string, behavior?: FakeProviderBehavior): FakeProviderAdapter
  workflow(id: string): void
  agent(id: string, workflowId: string): void
}

const harnesses: Harness[] = []

async function createHarness(config: ModelGatewayConfig = {}): Promise<Harness> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-m2-'))
  const context = createForgeContext(dir)
  const events: AgentEvent[] = []
  const registry = new ProviderRegistry()
  const gateway = new ModelGateway(
    registry,
    context.repositories.modelSessions,
    context.events,
    context.logger,
    { ...config, eventSink: (event) => events.push(event) }
  )
  const harness: Harness = {
    context,
    dir,
    gateway,
    registry,
    events,
    provider(id, behavior) {
      const provider = new FakeProviderAdapter(id, (event) => gateway.ingestProviderEvent(event), behavior)
      registry.register(provider)
      return provider
    },
    workflow(id) {
      context.repositories.projects.upsert({ id: 'project-1', name: 'Test', path: '/test' })
      context.repositories.workflows.create({ id, projectId: 'project-1', objective: 'Test workflow' })
    },
    agent(id, workflowId) {
      context.repositories.agents.create({
        id,
        workflowId,
        role: 'tester',
        systemInstructions: 'Test agent',
        modelConfig: { providerId: 'fake', modelId: 'fake/free-model' },
        availableTools: ['read_file'],
        filesystemPermissions: { roots: [], writableOwnership: [] },
        workingDirectory: '/workspace',
      })
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

describe('ModelGateway', () => {
  it('keeps provider sessions independent and enriches their events', async () => {
    const { gateway, provider, events, context, workflow, agent } = await createHarness()
    const providerA = provider('provider-a')
    const providerB = provider('provider-b')
    workflow('workflow-1')
    agent('agent-a', 'workflow-1')
    agent('agent-b', 'workflow-1')

    const sessionA = await gateway.createSession({
      providerId: 'provider-a',
      workspacePath: '/workspace/a',
      modelId: 'provider-a/free-model',
      workflowId: 'workflow-1',
      agentId: 'agent-a',
    })
    const sessionB = await gateway.createSession({
      providerId: 'provider-b',
      workspacePath: '/workspace/b',
      modelId: 'provider-b/free-model',
      workflowId: 'workflow-1',
      agentId: 'agent-b',
    })

    providerA.emitText(sessionA.providerSessionId, 'from a')
    providerB.emitText(sessionB.providerSessionId, 'from b')

    const deltas = events.filter((event) => event.type === 'text_delta')
    expect(deltas).toHaveLength(2)
    expect(deltas[0]).toMatchObject({
      providerId: 'provider-a',
      agentId: 'agent-a',
      workflowId: 'workflow-1',
      sessionId: sessionA.providerSessionId,
    })
    expect(deltas[1]).toMatchObject({
      providerId: 'provider-b',
      agentId: 'agent-b',
      workflowId: 'workflow-1',
      sessionId: sessionB.providerSessionId,
    })

    expect(context.repositories.modelSessions.getById(sessionA.id)?.providerId).toBe('provider-a')
    expect(context.repositories.modelSessions.getById(sessionB.id)?.providerId).toBe('provider-b')
  })

  it('persists token usage and emits a durable usage event', async () => {
    const { gateway, provider, context, workflow, agent } = await createHarness()
    workflow('workflow-usage')
    agent('agent-usage', 'workflow-usage')
    const fake = provider('usage-provider', {
      onPrompt: (_options, adapter) => {
        adapter.emitUsage('provider-usage-provider-1', {
          inputTokens: 120,
          outputTokens: 30,
          cacheReadTokens: 5,
          cacheWriteTokens: 2,
          costEstimate: 0.0042,
        })
      },
    })
    const session = await gateway.createSession({
      providerId: 'usage-provider',
      workspacePath: '/workspace/usage',
      modelId: 'usage-provider/free-model',
      workflowId: 'workflow-usage',
      agentId: 'agent-usage',
    })

    await gateway.submitPrompt({ sessionId: session.id, prompt: 'count tokens' })

    const record = context.repositories.modelSessions.getById(session.id)
    expect(record).toMatchObject({
      inputTokens: 120,
      outputTokens: 30,
      cacheReadTokens: 5,
      cacheWriteTokens: 2,
      costEstimate: 0.0042,
    })
    const durable = context.repositories.events.listByWorkflow('workflow-usage')
    expect(durable.some((event) => event.type === 'model:usage')).toBe(true)
    expect(fake.submitCalls).toHaveLength(1)
  })

  it('retries transient provider failures and stops on terminal failures', async () => {
    const { gateway, provider } = await createHarness({ maxAttempts: 2, retryDelayMs: 1 })
    let attempts = 0
    const fake = provider('retry-provider', {
      onPrompt: () => {
        attempts += 1
        if (attempts === 1) throw new Error('fetch failed: ECONNRESET')
      },
    })
    const session = await gateway.createSession({
      providerId: 'retry-provider',
      workspacePath: '/workspace/retry',
      modelId: 'retry-provider/free-model',
    })

    await gateway.submitPrompt({ sessionId: session.id, prompt: 'retry me' })
    expect(attempts).toBe(2)
    expect(fake.submitCalls).toHaveLength(2)

    const invalid = provider('invalid-provider', {
      onPrompt: () => {
        throw new Error('model not found')
      },
    })
    const invalidSession = await gateway.createSession({
      providerId: 'invalid-provider',
      workspacePath: '/workspace/invalid',
      modelId: 'invalid-provider/free-model',
    })
    await expect(
      gateway.submitPrompt({ sessionId: invalidSession.id, prompt: 'no retry' })
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
    expect(invalid.submitCalls).toHaveLength(1)
  })

  it('times out a stalled prompt, cancels the provider session, and reports TIMEOUT', async () => {
    const { gateway, provider, events } = await createHarness({ timeoutMs: 20, maxAttempts: 1 })
    const fake = provider('slow-provider', {
      onPrompt: () => new Promise<void>(() => undefined),
    })
    const session = await gateway.createSession({
      providerId: 'slow-provider',
      workspacePath: '/workspace/slow',
      modelId: 'slow-provider/free-model',
    })

    await expect(gateway.submitPrompt({ sessionId: session.id, prompt: 'stalled' })).rejects.toMatchObject({
      code: 'TIMEOUT',
    })
    expect(fake.cancelCalls).toContain(session.providerSessionId)
    expect(events.some((event) => event.type === 'error')).toBe(true)
  })

  it('cancels sessions and closes their persisted record', async () => {
    const { gateway, provider, context } = await createHarness()
    const fake = provider('cancel-provider')
    const session = await gateway.createSession({
      providerId: 'cancel-provider',
      workspacePath: '/workspace/cancel',
      modelId: 'cancel-provider/free-model',
    })

    await gateway.cancel(session.id)

    expect(fake.cancelCalls).toContain(session.providerSessionId)
    expect(context.repositories.modelSessions.getById(session.id)?.status).toBe('closed')
  })

  it('aggregates persisted usage by workflow', async () => {
    const { gateway, provider, workflow } = await createHarness()
    workflow('workflow-summary')
    const fake = provider('usage-summary-provider', {
      onPrompt: (_options, adapter) => {
        adapter.emitUsage('provider-usage-summary-provider-1', {
          inputTokens: 10,
          outputTokens: 20,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        })
        adapter.emitUsage('provider-usage-summary-provider-1', {
          inputTokens: 15,
          outputTokens: 25,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        })
      },
    })
    const session = await gateway.createSession({
      providerId: 'usage-summary-provider',
      workspacePath: '/workspace/summary',
      modelId: 'usage-summary-provider/free-model',
      workflowId: 'workflow-summary',
    })

    await gateway.submitPrompt({ sessionId: session.id, prompt: 'sum usage' })

    expect(gateway.getUsage('workflow-summary')).toMatchObject({
      workflowId: 'workflow-summary',
      sessions: 1,
      inputTokens: 15,
      outputTokens: 25,
      totalTokens: 40,
    })
    expect(fake.submitCalls).toHaveLength(1)
  })
})
