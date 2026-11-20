import type { BrowserWindow } from 'electron'
import { IpcChannels } from '../src/shared/ipc'
import type {
  AgentAuthStatus,
  AgentEvent,
  AgentId,
  AgentModel,
  AgentSession,
  CreateSessionOptions,
  SubmitPromptOptions,
} from '../src/shared/agent'
import type { GatewaySession, ModelGateway } from './models/model-gateway'

export class AgentService {
  private readonly getWindow: () => BrowserWindow | null
  private readonly gateway: ModelGateway

  constructor(getWindow: () => BrowserWindow | null, gateway: ModelGateway) {
    this.getWindow = getWindow
    this.gateway = gateway
  }

  broadcastEvent(event: AgentEvent): void {
    const win = this.getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IpcChannels.agentEvent, event)
    }
  }

  async checkAuth(agentId: AgentId): Promise<AgentAuthStatus> {
    try {
      return await this.gateway.checkAuth(agentId)
    } catch {
      const milestone = agentId === 'codex' ? 'Milestone 4' : 'Milestone 5'
      const name = agentId === 'codex' ? 'OpenAI Codex' : 'Gemini via Antigravity CLI'
      return {
        agentId,
        providerId: agentId,
        state: 'unauthenticated',
        connectedProviders: [],
        details: `${name} adapter is scheduled for ${milestone}. No simulated credentials or fake activity.`,
        loginMethod: 'none',
      }
    }
  }

  async listModels(agentId: AgentId): Promise<AgentModel[]> {
    try {
      const catalogs = await this.gateway.listModels(agentId)
      return catalogs.flatMap((catalog) => catalog.models)
    } catch {
      return []
    }
  }

  async createSession(agentId: AgentId, options: CreateSessionOptions): Promise<AgentSession> {
    const session = await this.gateway.createSession({
      providerId: agentId,
      workspacePath: options.workspacePath,
      modelId: options.modelId,
      title: options.title,
    })
    return this.toAgentSession(session)
  }

  async submitPrompt(agentId: AgentId, options: SubmitPromptOptions): Promise<void> {
    await this.gateway.submitPrompt({
      providerId: agentId,
      sessionId: options.sessionId,
      prompt: options.prompt,
      modelId: options.modelId,
      workspacePath: options.workspacePath,
    })
  }

  async cancel(agentId: AgentId, sessionId: string, workspacePath?: string): Promise<void> {
    await this.gateway.cancel(sessionId, agentId)
    void workspacePath
  }

  async dispose(): Promise<void> {
    await this.gateway.dispose()
  }

  private toAgentSession(session: GatewaySession): AgentSession {
    return {
      id: session.providerSessionId,
      agentId: session.providerId as AgentId,
      providerId: session.providerId,
      workspacePath: session.workspacePath,
      modelId: session.modelId,
      createdAt: session.record.createdAt,
    }
  }
}
