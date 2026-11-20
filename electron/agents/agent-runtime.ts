import { ForgeErrorImpl } from '../../src/shared/errors'
import type { Agent, AgentStatus, SpawnAgentRequest } from '../../src/shared/domain'
import type { TypedEventBus } from '../coordination/event-bus'
import type { StructuredLogger } from '../observability/logger'
import type { Repositories } from '../persistence/repositories'
import type { ModelGateway } from '../models/model-gateway'
import type { AgentFactory } from './agent-factory'
import type { AgentRegistry } from './agent-registry'
import { resolveRoleProfile } from './agent-prompts/roles'

const ALLOWED_TRANSITIONS: Record<AgentStatus, AgentStatus[]> = {
  idle: ['initializing', 'running', 'terminated'],
  initializing: ['running', 'waiting', 'failed', 'terminated'],
  running: ['waiting', 'completed', 'failed', 'terminated'],
  waiting: ['running', 'failed', 'terminated'],
  completed: [],
  failed: ['initializing', 'terminated'],
  terminated: [],
}

export interface AgentRuntimeConfig {
  maxConcurrentAgents?: number
  maxConcurrentPerWorkflow?: number
  heartbeatTimeoutMs?: number
}

export class AgentRuntime {
  private readonly maxConcurrentAgents: number
  private readonly maxConcurrentPerWorkflow: number
  private readonly heartbeatTimeoutMs: number
  private readonly parentByAgent = new Map<string, string | undefined>()

  constructor(
    private readonly repositories: Repositories,
    private readonly registry: AgentRegistry,
    private readonly factory: AgentFactory,
    private readonly gateway: ModelGateway,
    private readonly events: TypedEventBus,
    private readonly logger: StructuredLogger,
    config: AgentRuntimeConfig = {}
  ) {
    this.maxConcurrentAgents = config.maxConcurrentAgents ?? 8
    this.maxConcurrentPerWorkflow = config.maxConcurrentPerWorkflow ?? 3
    this.heartbeatTimeoutMs = config.heartbeatTimeoutMs ?? 120_000
  }

  async spawn(input: SpawnAgentRequest): Promise<Agent> {
    const profile = resolveRoleProfile(input.role, input.dynamicProfile)
    if (this.registry.countActive() >= this.maxConcurrentAgents) {
      throw new ForgeErrorImpl('CONFLICT', 'Global agent concurrency limit reached.', {
        limit: this.maxConcurrentAgents,
      })
    }
    if (this.registry.countActive(input.workflowId) >= this.maxConcurrentPerWorkflow) {
      throw new ForgeErrorImpl('CONFLICT', 'Workflow agent concurrency limit reached.', {
        workflowId: input.workflowId,
        limit: this.maxConcurrentPerWorkflow,
      })
    }

    const depth = this.recursionDepth(input.parentAgentId)
    if (depth >= profile.executionLimits.maxRecursionDepth) {
      throw new ForgeErrorImpl('PERMISSION_DENIED', 'Agent recursion depth limit reached.', {
        depth,
        limit: profile.executionLimits.maxRecursionDepth,
      })
    }

    const result = await this.factory.spawn(input)
    this.parentByAgent.set(result.agent.id, input.parentAgentId)
    this.registry.register(result.agent)
    this.transition(result.agent.id, 'running', 'Agent session is ready.')
    return this.registry.require(result.agent.id)
  }

  get(agentId: string): Agent | null {
    return this.registry.get(agentId) ?? this.repositories.agents.getById(agentId)
  }

  list(workflowId: string): Agent[] {
    return this.repositories.agents.listByWorkflow(workflowId)
  }

  transition(agentId: string, next: AgentStatus, reason?: string): Agent {
    const agent = this.registry.require(agentId)
    if (agent.status === next) return agent
    if (!ALLOWED_TRANSITIONS[agent.status].includes(next)) {
      throw new ForgeErrorImpl('CONFLICT', `Agent cannot transition from "${agent.status}" to "${next}".`, {
        agentId,
        from: agent.status,
        to: next,
      })
    }

    const timestamp = Date.now()
    const patch: Partial<Agent> = { status: next }
    if (next === 'running' || next === 'waiting') patch.heartbeatAt = timestamp
    if (next === 'completed' || next === 'terminated') patch.completedAt = timestamp
    if (next === 'failed') patch.failureReason = reason ?? 'Agent failed.'

    const updated = this.repositories.agents.update(agentId, patch)
    if (!updated) {
      throw new ForgeErrorImpl('NOT_FOUND', `Agent "${agentId}" disappeared during transition.`, { agentId })
    }
    this.registry.register(updated)

    const eventType = this.eventTypeFor(next)
    this.events.emit({
      workflowId: updated.workflowId,
      agentId: updated.id,
      type: eventType,
      payload: {
        from: agent.status,
        to: next,
        ...(reason ? { reason } : {}),
      },
    })
    this.logger.info(`agent:${next}`, { agentId: updated.id, workflowId: updated.workflowId, reason })
    return updated
  }

  start(agentId: string): Agent {
    return this.transition(agentId, 'running')
  }

  wait(agentId: string): Agent {
    return this.transition(agentId, 'waiting')
  }

  complete(agentId: string): Agent {
    return this.transition(agentId, 'completed')
  }

  fail(agentId: string, reason: string): Agent {
    return this.transition(agentId, 'failed', reason)
  }

  terminate(agentId: string): Agent {
    return this.transition(agentId, 'terminated')
  }

  heartbeat(agentId: string): Agent {
    const agent = this.registry.require(agentId)
    void agent
    const updated = this.repositories.agents.update(agentId, { heartbeatAt: Date.now() })
    if (!updated) {
      throw new ForgeErrorImpl('NOT_FOUND', `Agent "${agentId}" disappeared during heartbeat.`, { agentId })
    }
    this.registry.register(updated)
    return updated
  }

  sweepStale(): Agent[] {
    const stale: Agent[] = []
    const now = Date.now()
    for (const agent of this.registry.list()) {
      if (agent.status !== 'running') continue
      const lastBeat = agent.heartbeatAt ?? agent.createdAt
      if (now - lastBeat <= this.heartbeatTimeoutMs) continue
      stale.push(this.fail(agent.id, 'Agent heartbeat timed out.'))
    }
    for (const agent of this.repositories.agents.listAll()) {
      if (agent.status !== 'running') continue
      const lastBeat = agent.heartbeatAt ?? agent.createdAt
      if (now - lastBeat <= this.heartbeatTimeoutMs) continue
      if (stale.some((item) => item.id === agent.id)) continue
      if (!this.registry.get(agent.id)) this.registry.register(agent)
      stale.push(this.fail(agent.id, 'Agent heartbeat timed out.'))
    }
    return stale
  }

  recordTokenUsage(agentId: string, tokens: number): Agent {
    const agent = this.registry.require(agentId)
    if (tokens < 0 || !Number.isFinite(tokens)) {
      throw new ForgeErrorImpl('INVALID_ARGUMENT', 'Token delta must be a finite non-negative number.', { agentId })
    }
    const next = agent.tokensUsed + Math.floor(tokens)
    const updated = this.repositories.agents.update(agentId, { tokensUsed: next })
    if (!updated) {
      throw new ForgeErrorImpl('NOT_FOUND', `Agent "${agentId}" disappeared during usage update.`, { agentId })
    }
    this.registry.register(updated)

    if (next > updated.executionLimits.tokenBudget) {
      this.fail(agentId, `Token budget exceeded: ${next}/${updated.executionLimits.tokenBudget}`)
      throw new ForgeErrorImpl('PERMISSION_DENIED', 'Agent token budget exceeded.', {
        agentId,
        tokensUsed: next,
        budget: updated.executionLimits.tokenBudget,
      })
    }
    return updated
  }

  async execute(agentId: string, prompt: string): Promise<Agent> {
    const agent = this.registry.require(agentId)
    if (!agent.modelSessionId) {
      throw new ForgeErrorImpl('NOT_FOUND', `Agent "${agentId}" has no model session.`, { agentId })
    }

    try {
      if (agent.status !== 'running') this.transition(agentId, 'running')
      await this.gateway.submitPrompt({
        sessionId: agent.modelSessionId,
        prompt,
        workspacePath: agent.workingDirectory,
        modelId: agent.modelConfig.modelId,
        agentId: agent.id,
        workflowId: agent.workflowId,
        taskId: agent.assignedTaskId ?? undefined,
      })
      this.heartbeat(agentId)

      const session = this.gateway.getSession(agent.modelSessionId)
      if (session) {
        const record = session.record
        const total =
          record.inputTokens + record.outputTokens + record.cacheReadTokens + record.cacheWriteTokens
        this.recordTokenUsage(agentId, Math.max(0, total - this.registry.require(agentId).tokensUsed))
      }

      return this.complete(agentId)
    } catch (error) {
      const current = this.registry.require(agentId)
      if (current.status !== 'failed' && current.status !== 'terminated') {
        this.fail(agentId, error instanceof Error ? error.message : String(error))
      }
      throw error
    }
  }

  private recursionDepth(parentAgentId?: string): number {
    let depth = 0
    let cursor = parentAgentId
    const visited = new Set<string>()
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor)
      depth += 1
      cursor = this.parentByAgent.get(cursor)
    }
    return depth
  }

  private eventTypeFor(status: AgentStatus): 'agent:started' | 'agent:updated' | 'agent:completed' | 'agent:failed' {
    if (status === 'running') return 'agent:started'
    if (status === 'completed') return 'agent:completed'
    if (status === 'failed') return 'agent:failed'
    return 'agent:updated'
  }
}
