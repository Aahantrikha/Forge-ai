import type { BrowserWindow } from 'electron'
import { IpcChannels } from '../src/shared/ipc'
import type {
  AgentAdapter,
  AgentAuthStatus,
  AgentEvent,
  AgentId,
  AgentModel,
  AgentSession,
  CreateSessionOptions,
  SubmitPromptOptions,
} from '../src/shared/agent'
import { OpencodeAdapter } from './agents/opencode'

/**
 * Main-process service managing AI coding agent adapters.
 * Dispatches commands to the appropriate provider adapter and streams events to the renderer.
 */
export class AgentService {
  private adapters = new Map<AgentId, AgentAdapter>()
  private getWindow: () => BrowserWindow | null

  constructor(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow

    // Initialize OpenCode adapter (Milestone 3)
    const opencodeAdapter = new OpencodeAdapter((event: AgentEvent) => {
      this.broadcastEvent(event)
    })
    this.adapters.set('opencode', opencodeAdapter)
  }

  private broadcastEvent(event: AgentEvent) {
    const win = this.getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IpcChannels.agentEvent, event)
    }
  }

  private getAdapter(agentId: AgentId): AgentAdapter | null {
    return this.adapters.get(agentId) ?? null
  }

  async checkAuth(agentId: AgentId): Promise<AgentAuthStatus> {
    const adapter = this.getAdapter(agentId)
    if (adapter) {
      return adapter.checkAuth()
    }

    // Honest status for future milestones (Forge AI Spec §12)
    const milestone = agentId === 'codex' ? 'Milestone 4' : 'Milestone 5'
    const name = agentId === 'codex' ? 'OpenAI Codex' : 'Gemini via Antigravity CLI'
    return {
      agentId,
      state: 'unauthenticated',
      connectedProviders: [],
      details: `${name} adapter is scheduled for ${milestone}. No simulated credentials or fake activity.`,
      loginMethod: 'none',
    }
  }

  async listModels(agentId: AgentId): Promise<AgentModel[]> {
    const adapter = this.getAdapter(agentId)
    if (adapter) {
      return adapter.listModels()
    }
    return []
  }

  async createSession(agentId: AgentId, options: CreateSessionOptions): Promise<AgentSession> {
    const adapter = this.getAdapter(agentId)
    if (!adapter) {
      throw new Error(`Agent adapter for "${agentId}" is not implemented yet.`)
    }
    return adapter.createSession(options)
  }

  async submitPrompt(agentId: AgentId, options: SubmitPromptOptions): Promise<void> {
    const adapter = this.getAdapter(agentId)
    if (!adapter) {
      throw new Error(`Agent adapter for "${agentId}" is not implemented yet.`)
    }
    return adapter.submitPrompt(options)
  }

  async cancel(agentId: AgentId, sessionId: string, workspacePath?: string): Promise<void> {
    const adapter = this.getAdapter(agentId)
    if (adapter) {
      await adapter.cancel(sessionId, workspacePath)
    }
  }

  async dispose(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      try {
        await adapter.dispose()
      } catch {
        // Ignore during shutdown
      }
    }
    this.adapters.clear()
  }
}
