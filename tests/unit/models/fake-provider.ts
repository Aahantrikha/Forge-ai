import type {
  AgentAuthStatus,
  AgentCapabilities,
  AgentModel,
  TokenUsage,
} from '../../../src/shared/agent'
import type {
  ProviderAdapter,
  ProviderCreateSessionOptions,
  ProviderEventSink,
  ProviderSession,
  ProviderSubmitPromptOptions,
} from '../../../electron/models/provider-adapter'

export interface FakeProviderBehavior {
  onPrompt?: (options: ProviderSubmitPromptOptions, adapter: FakeProviderAdapter) => Promise<void> | void
}

export class FakeProviderAdapter implements ProviderAdapter {
  readonly capabilities: AgentCapabilities = {
    streaming: true,
    toolEvents: true,
    cancellation: true,
    fileChanges: true,
    sessionResumption: true,
    modelSelection: true,
  }

  readonly submitCalls: ProviderSubmitPromptOptions[] = []
  readonly cancelCalls: string[] = []
  private sessionCount = 0

  constructor(
    readonly id: string,
    private readonly onEvent: ProviderEventSink,
    private readonly behavior: FakeProviderBehavior = {}
  ) {}

  async checkAuth(): Promise<AgentAuthStatus> {
    return {
      agentId: 'opencode',
      providerId: this.id,
      state: 'authenticated',
      connectedProviders: [this.id],
      loginMethod: 'none',
    }
  }

  async listModels(): Promise<AgentModel[]> {
    return [
      {
        id: `${this.id}/free-model`,
        name: 'Free Model',
        providerId: this.id,
        isFree: true,
        cost: { input: 0, output: 0 },
      },
    ]
  }

  async createSession(options: ProviderCreateSessionOptions): Promise<ProviderSession> {
    this.sessionCount += 1
    return {
      id: `provider-${this.id}-${this.sessionCount}`,
      agentId: 'opencode',
      providerId: this.id,
      workspacePath: options.workspacePath,
      modelId: options.modelId ?? `${this.id}/free-model`,
      createdAt: Date.now(),
    }
  }

  async submitPrompt(options: ProviderSubmitPromptOptions): Promise<void> {
    this.submitCalls.push(options)
    await this.behavior.onPrompt?.(options, this)
  }

  async cancel(sessionId: string): Promise<void> {
    this.cancelCalls.push(sessionId)
  }

  async dispose(): Promise<void> {
    return
  }

  emitText(sessionId: string, delta: string): void {
    this.onEvent({
      type: 'text_delta',
      sessionId,
      providerId: this.id,
      messageId: 'message-1',
      delta,
    })
  }

  emitUsage(sessionId: string, usage: TokenUsage): void {
    this.onEvent({
      type: 'usage',
      sessionId,
      providerId: this.id,
      usage,
    })
  }
}
