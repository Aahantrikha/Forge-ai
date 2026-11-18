/**
 * Unified Agent Abstraction (Forge AI Spec §1, §2, §5, §11).
 *
 * Provider-independent contracts for AI coding agents:
 * - OpenCode (Milestone 3)
 * - OpenAI Codex (Milestone 4)
 * - Gemini via Antigravity CLI (Milestone 5)
 *
 * Core principles:
 * 1. Maintain provider-specific capabilities rather than pretending all agents are identical.
 * 2. Clearly distinguish free models from paid models — never auto-select paid providers.
 * 3. Real agent activity only: never fabricate activity events (§5).
 */

export type AgentId = 'opencode' | 'codex' | 'gemini'

export interface AgentCapabilities {
  streaming: boolean
  toolEvents: boolean
  cancellation: boolean
  fileChanges: boolean
  sessionResumption: boolean
  modelSelection: boolean
}

export type AuthState = 'authenticated' | 'unauthenticated' | 'needs_login' | 'error'

export interface AgentAuthStatus {
  agentId: AgentId
  state: AuthState
  details?: string
  connectedProviders: string[]
  loginMethod?: 'oauth' | 'api' | 'cli' | 'none'
  loginUrl?: string
}

export interface AgentModelCost {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
}

export interface AgentModel {
  id: string
  name: string
  providerId: string
  isFree: boolean
  cost: AgentModelCost
  description?: string
  contextLimit?: number
}

export type ToolType =
  | 'read_file'
  | 'search_codebase'
  | 'run_command'
  | 'edit_file'
  | 'create_file'
  | 'run_tests'
  | 'generic'

export interface AgentToolActivity {
  id: string
  toolType: ToolType
  title: string
  detail?: string
  status: 'running' | 'completed' | 'failed'
  startedAt: number
  finishedAt?: number
  error?: string
}

export type AgentEvent =
  | {
      type: 'status'
      sessionId: string
      status: 'connecting' | 'idle' | 'generating' | 'aborted' | 'error'
      message?: string
    }
  | {
      type: 'text_delta'
      sessionId: string
      messageId: string
      delta: string
    }
  | {
      type: 'tool_activity'
      sessionId: string
      activity: AgentToolActivity
    }
  | {
      type: 'file_change'
      sessionId: string
      path: string
      changeType: 'created' | 'modified' | 'deleted'
    }
  | {
      type: 'done'
      sessionId: string
      fullText?: string
    }
  | {
      type: 'error'
      sessionId: string
      error: string
    }

export interface AgentSession {
  id: string
  agentId: AgentId
  workspacePath: string
  modelId: string
  title?: string
  createdAt: number
}

export interface CreateSessionOptions {
  workspacePath: string
  modelId?: string
  title?: string
}

export interface SubmitPromptOptions {
  sessionId: string
  prompt: string
  modelId?: string
  workspacePath: string
}

/**
 * Provider-independent adapter interface implemented by all back-ends in the main process.
 */
export interface AgentAdapter {
  readonly id: AgentId
  readonly capabilities: AgentCapabilities

  checkAuth(): Promise<AgentAuthStatus>
  listModels(): Promise<AgentModel[]>
  createSession(options: CreateSessionOptions): Promise<AgentSession>
  submitPrompt(options: SubmitPromptOptions): Promise<void>
  cancel(sessionId: string, workspacePath?: string): Promise<void>
  dispose(): Promise<void>
}
