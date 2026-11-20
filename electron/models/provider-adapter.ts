import type {
  AgentAuthStatus,
  AgentCapabilities,
  AgentEvent,
  AgentModel,
  AgentSession,
  CreateSessionOptions,
  ProviderId,
  SubmitPromptOptions,
} from '../../src/shared/agent'

export interface ProviderSession extends AgentSession {
  providerId: ProviderId
}

export interface ProviderCreateSessionOptions extends CreateSessionOptions {
  workflowId?: string
  agentId?: string
  taskId?: string
  correlationId?: string
}

export interface ProviderSubmitPromptOptions extends SubmitPromptOptions {
  workflowId?: string
  agentId?: string
  taskId?: string
  correlationId?: string
}

export interface ProviderAdapter {
  readonly id: ProviderId
  readonly capabilities: AgentCapabilities
  checkAuth(): Promise<AgentAuthStatus>
  listModels(): Promise<AgentModel[]>
  createSession(options: ProviderCreateSessionOptions): Promise<ProviderSession>
  submitPrompt(options: ProviderSubmitPromptOptions): Promise<void>
  cancel(sessionId: string, workspacePath?: string): Promise<void>
  dispose(): Promise<void>
}

export type ProviderEventSink = (event: AgentEvent) => void

export type ProviderAdapterFactory = (onEvent: ProviderEventSink) => ProviderAdapter
