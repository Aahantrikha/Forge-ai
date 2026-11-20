import type { ModelSession } from '../../src/shared/domain'
import type {
  AgentAuthStatus,
  AgentEvent,
  CreateSessionOptions,
  ProviderId,
  SubmitPromptOptions,
  TokenUsage,
} from '../../src/shared/agent'
import { ForgeErrorImpl } from '../../src/shared/errors'
import type { ModelCatalogEntry, ModelUsageSummary } from '../../src/shared/model'
import type { TypedEventBus } from '../coordination/event-bus'
import type { StructuredLogger } from '../observability/logger'
import type { ModelSessionRepository } from '../persistence/repositories'
import type { ProviderAdapter } from './provider-adapter'
import { ProviderRegistry } from './provider-registry'

export interface GatewayCreateSessionOptions extends CreateSessionOptions {
  providerId: ProviderId
  workflowId?: string
  agentId?: string
  taskId?: string
  correlationId?: string
}

export interface GatewaySubmitPromptOptions extends SubmitPromptOptions {
  providerId?: ProviderId
  workflowId?: string
  agentId?: string
  taskId?: string
  correlationId?: string
}

export interface GatewaySession {
  id: string
  providerId: ProviderId
  providerSessionId: string
  workspacePath: string
  modelId: string
  agentId?: string
  workflowId?: string
  taskId?: string
  record: ModelSession
}

export interface ModelGatewayConfig {
  timeoutMs?: number
  maxAttempts?: number
  retryDelayMs?: number
  eventSink?: (event: AgentEvent) => void
}

interface SessionContext extends GatewaySession {
  correlationId?: string
}

function providerKey(providerId: ProviderId, sessionId: string): string {
  return `${providerId}:${sessionId}`
}

function maxValue(current: number, incoming: number | undefined): number {
  return Math.max(current, incoming ?? 0)
}

export class ModelGateway {
  private readonly sessionsById = new Map<string, SessionContext>()
  private readonly sessionsByProvider = new Map<string, SessionContext>()
  private readonly timeoutMs: number
  private readonly maxAttempts: number
  private readonly retryDelayMs: number
  private eventSink: (event: AgentEvent) => void

  constructor(
    private readonly registry: ProviderRegistry,
    private readonly sessions: ModelSessionRepository,
    private readonly events: TypedEventBus,
    private readonly logger: StructuredLogger,
    config: ModelGatewayConfig = {}
  ) {
    this.timeoutMs = config.timeoutMs ?? 120_000
    this.maxAttempts = Math.max(1, config.maxAttempts ?? 2)
    this.retryDelayMs = config.retryDelayMs ?? 500
    this.eventSink = config.eventSink ?? (() => undefined)
  }

  setEventSink(sink: (event: AgentEvent) => void): void {
    this.eventSink = sink
  }

  getRegistry(): ProviderRegistry {
    return this.registry
  }

  async checkAuth(providerId: ProviderId): Promise<AgentAuthStatus> {
    return this.registry.get(providerId).checkAuth()
  }

  async listModels(providerId?: ProviderId): Promise<ModelCatalogEntry[]> {
    const providerIds = providerId ? [providerId] : this.registry.list()
    const entries: ModelCatalogEntry[] = []
    for (const id of providerIds) {
      const adapter = this.registry.get(id)
      entries.push({ providerId: id, models: await adapter.listModels() })
    }
    return entries
  }

  async createSession(options: GatewayCreateSessionOptions): Promise<GatewaySession> {
    const adapter = this.registry.get(options.providerId, (event) => this.ingestProviderEvent(event))
    const providerSession = await adapter.createSession({
      workspacePath: options.workspacePath,
      modelId: options.modelId,
      title: options.title,
      workflowId: options.workflowId,
      agentId: options.agentId,
      taskId: options.taskId,
      correlationId: options.correlationId,
    })

    const record = this.sessions.create({
      workflowId: options.workflowId ?? null,
      agentId: options.agentId ?? null,
      providerId: options.providerId,
      modelId: providerSession.modelId,
      providerSessionId: providerSession.id,
    })

    const session: SessionContext = {
      id: record.id,
      providerId: options.providerId,
      providerSessionId: providerSession.id,
      workspacePath: options.workspacePath,
      modelId: providerSession.modelId,
      agentId: options.agentId,
      workflowId: options.workflowId,
      taskId: options.taskId,
      correlationId: options.correlationId,
      record,
    }
    this.sessionsById.set(session.id, session)
    this.sessionsByProvider.set(providerKey(session.providerId, session.providerSessionId), session)

    this.events.emit({
      workflowId: session.workflowId ?? null,
      agentId: session.agentId ?? null,
      taskId: session.taskId ?? null,
      type: 'model:session-created',
      payload: {
        sessionId: session.id,
        providerId: session.providerId,
        providerSessionId: session.providerSessionId,
        modelId: session.modelId,
      },
      correlationId: session.correlationId,
    })
    this.logger.info('model:session-created', {
      sessionId: session.id,
      providerId: session.providerId,
      modelId: session.modelId,
    })
    return this.toGatewaySession(session)
  }

  getSession(sessionId: string): GatewaySession | null {
    const session = this.sessionsById.get(sessionId)
    return session ? this.toGatewaySession(session) : null
  }

  listSessions(filters: { workflowId?: string; agentId?: string } = {}): ModelSession[] {
    if (filters.workflowId) {
      return this.sessions.listByWorkflow(filters.workflowId)
    }
    if (filters.agentId) {
      return this.sessions.listByAgent(filters.agentId)
    }
    return this.sessions.listAll()
  }

  async submitPrompt(options: GatewaySubmitPromptOptions): Promise<GatewaySession> {
    const session = this.resolveSession(options.sessionId, options.providerId)
    const adapter = this.registry.get(session.providerId)
    const providerOptions = {
      sessionId: session.providerSessionId,
      prompt: options.prompt,
      modelId: options.modelId ?? session.modelId,
      workspacePath: options.workspacePath ?? session.workspacePath,
      workflowId: options.workflowId ?? session.workflowId,
      agentId: options.agentId ?? session.agentId,
      taskId: options.taskId ?? session.taskId,
      correlationId: options.correlationId ?? session.correlationId,
    }

    let lastError: unknown = null
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        await this.runAttempt(adapter, session, providerOptions, attempt)
        return this.toGatewaySession(session)
      } catch (error) {
        lastError = error
        const forgeError = this.toForgeError(error, session, 'submit')
        if (!this.isRetryable(error) || attempt === this.maxAttempts) {
          this.reportFailure(session, forgeError)
          throw forgeError
        }
        this.logger.warn('model:prompt-retry', {
          sessionId: session.id,
          providerId: session.providerId,
          attempt,
          message: forgeError.message,
        })
        await this.delay(this.retryDelayMs * attempt)
      }
    }

    const forgeError = this.toForgeError(lastError, session, 'submit')
    this.reportFailure(session, forgeError)
    throw forgeError
  }

  async cancel(sessionId: string, providerId?: ProviderId): Promise<void> {
    const session = this.resolveSession(sessionId, providerId)
    const adapter = this.registry.get(session.providerId)
    await adapter.cancel(session.providerSessionId, session.workspacePath)
    this.sessions.close(session.id)
    session.record = this.sessions.getById(session.id) ?? session.record
    this.logger.info('model:session-cancelled', {
      sessionId: session.id,
      providerId: session.providerId,
    })
  }

  getUsage(workflowId?: string): ModelUsageSummary {
    const records = workflowId ? this.sessions.listByWorkflow(workflowId) : this.sessions.listAll()
    const summary: ModelUsageSummary = {
      workflowId: workflowId ?? null,
      sessions: records.length,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 0,
      costEstimate: 0,
    }
    for (const record of records) {
      summary.inputTokens += record.inputTokens
      summary.outputTokens += record.outputTokens
      summary.cacheReadTokens += record.cacheReadTokens
      summary.cacheWriteTokens += record.cacheWriteTokens
      summary.costEstimate += record.costEstimate ?? 0
    }
    summary.totalTokens = summary.inputTokens + summary.outputTokens + summary.cacheReadTokens + summary.cacheWriteTokens
    summary.costEstimate = Number(summary.costEstimate.toFixed(6))
    return summary
  }

  ingestProviderEvent(event: AgentEvent): void {
    const session = this.sessionsByProvider.get(providerKey(event.providerId, event.sessionId))
    const enriched: AgentEvent = {
      ...event,
      providerId: event.providerId ?? session?.providerId ?? 'unknown',
      agentId: event.agentId ?? session?.agentId,
      workflowId: event.workflowId ?? session?.workflowId,
      taskId: event.taskId ?? session?.taskId,
      correlationId: event.correlationId ?? session?.correlationId,
    }

    if (enriched.type === 'usage') {
      if (session) this.recordUsage(session, enriched.usage)
      this.events.emit({
        workflowId: enriched.workflowId ?? null,
        agentId: enriched.agentId ?? null,
        taskId: enriched.taskId ?? null,
        type: 'model:usage',
        payload: {
          sessionId: enriched.sessionId,
          providerId: enriched.providerId,
          usage: enriched.usage,
        },
        correlationId: enriched.correlationId,
      })
    }

    if (enriched.type === 'error') {
      this.events.emit({
        workflowId: enriched.workflowId ?? null,
        agentId: enriched.agentId ?? null,
        taskId: enriched.taskId ?? null,
        type: 'model:error',
        payload: {
          sessionId: enriched.sessionId,
          providerId: enriched.providerId,
          error: enriched.error,
        },
        correlationId: enriched.correlationId,
      })
    }

    this.eventSink(enriched)
  }

  async dispose(): Promise<void> {
    this.sessionsById.clear()
    this.sessionsByProvider.clear()
    await this.registry.dispose()
  }

  private async runAttempt(
    adapter: ProviderAdapter,
    session: SessionContext,
    options: Parameters<ProviderAdapter['submitPrompt']>[0],
    attempt: number
  ): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        void adapter.cancel(session.providerSessionId, session.workspacePath).catch(() => undefined)
        reject(new ForgeErrorImpl('TIMEOUT', `Model request timed out after ${this.timeoutMs}ms.`, {
          providerId: session.providerId,
          sessionId: session.id,
          attempt,
        }))
      }, this.timeoutMs)
    })

    try {
      await Promise.race([adapter.submitPrompt(options), timeout])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  private recordUsage(session: SessionContext, usage: TokenUsage): void {
    const current = this.sessions.getById(session.id)
    this.sessions.updateUsage(session.id, {
      inputTokens: maxValue(current?.inputTokens ?? 0, usage.inputTokens),
      outputTokens: maxValue(current?.outputTokens ?? 0, usage.outputTokens),
      cacheReadTokens: maxValue(current?.cacheReadTokens ?? 0, usage.cacheReadTokens),
      cacheWriteTokens: maxValue(current?.cacheWriteTokens ?? 0, usage.cacheWriteTokens),
      costEstimate: Math.max(current?.costEstimate ?? 0, usage.costEstimate ?? 0),
    })
    session.record = this.sessions.getById(session.id) ?? session.record
  }

  private reportFailure(session: SessionContext, error: ForgeErrorImpl): void {
    this.logger.error('model:error', {
      sessionId: session.id,
      providerId: session.providerId,
      code: error.code,
      message: error.message,
    })
    this.eventSink({
      type: 'error',
      sessionId: session.providerSessionId,
      providerId: session.providerId,
      agentId: session.agentId,
      workflowId: session.workflowId,
      taskId: session.taskId,
      correlationId: session.correlationId,
      error: error.message,
    })
  }

  private resolveSession(sessionId: string, providerId?: ProviderId): SessionContext {
    const byId = this.sessionsById.get(sessionId)
    if (byId) return byId

    if (providerId) {
      const byProvider = this.sessionsByProvider.get(providerKey(providerId, sessionId))
      if (byProvider) return byProvider
    }

    for (const [key, value] of this.sessionsByProvider.entries()) {
      if (key.endsWith(`:${sessionId}`)) return value
    }

    throw new ForgeErrorImpl('NOT_FOUND', `Model session "${sessionId}" is not registered.`, {
      sessionId,
      providerId,
    })
  }

  private toForgeError(error: unknown, session: SessionContext, phase: string): ForgeErrorImpl {
    if (error instanceof ForgeErrorImpl) return error
    const message = error instanceof Error ? error.message : String(error)
    return new ForgeErrorImpl('PROVIDER_ERROR', message, {
      providerId: session.providerId,
      sessionId: session.id,
      phase,
    })
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof ForgeErrorImpl) return error.code === 'PROVIDER_ERROR'
    const message = error instanceof Error ? error.message : String(error)
    return /(ECONNRESET|ECONNREFUSED|ETIMEDOUT|fetch failed|network|socket hang up|temporarily unavailable|502|503)/i.test(message)
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private toGatewaySession(session: SessionContext): GatewaySession {
    return {
      id: session.id,
      providerId: session.providerId,
      providerSessionId: session.providerSessionId,
      workspacePath: session.workspacePath,
      modelId: session.modelId,
      agentId: session.agentId,
      workflowId: session.workflowId,
      taskId: session.taskId,
      record: session.record,
    }
  }
}
