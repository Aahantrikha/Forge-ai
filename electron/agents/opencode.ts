import path from 'node:path'
import {
  createOpencodeClient,
  createOpencodeServer,
  type OpencodeClient,
} from '@opencode-ai/sdk'
import type {
  AgentAdapter,
  AgentAuthStatus,
  AgentCapabilities,
  AgentEvent,
  AgentModel,
  AgentSession,
  AgentToolActivity,
  CreateSessionOptions,
  SubmitPromptOptions,
  ToolType,
} from '../../src/shared/agent'

/**
 * OpenCode Agent Adapter (Forge AI Milestone 3).
 *
 * Implements the unified AgentAdapter interface using the official @opencode-ai/sdk.
 * - Spawns and manages a local headless OpenCode server on 127.0.0.1.
 * - Subscribes to real SSE event streams for messages, tools, and file edits.
 * - Detects and clearly marks free models vs paid models (Forge AI Spec §1, §11).
 * - Never fabricates agent activity (Forge AI Spec §5).
 */
export class OpencodeAdapter implements AgentAdapter {
  readonly id = 'opencode' as const

  readonly capabilities: AgentCapabilities = {
    streaming: true,
    toolEvents: true,
    cancellation: true,
    fileChanges: true,
    sessionResumption: true,
    modelSelection: true,
  }

  private server: { url: string; close(): void } | null = null
  private client: OpencodeClient | null = null
  private serverUrl: string | null = null
  private eventStreams = new Map<string, { abort: () => void }>()
  private onEventCallback: (event: AgentEvent) => void

  constructor(onEvent: (event: AgentEvent) => void) {
    this.onEventCallback = onEvent
    this.ensureBinPath()
  }

  /** Ensure node_modules/.bin is on process.env.PATH so cross-spawn finds opencode */
  private ensureBinPath() {
    const binPath = path.resolve(process.cwd(), 'node_modules', '.bin')
    const current = process.env.PATH || ''
    if (!current.includes(binPath)) {
      process.env.PATH = `${binPath}${path.delimiter}${current}`
    }
  }

  /**
   * Ensures the OpenCode local server is active on 127.0.0.1.
   * If a server is already listening on port 4096, reuses it; otherwise starts one.
   */
  private async ensureServer(): Promise<{ url: string; client: OpencodeClient }> {
    if (this.client && this.serverUrl) {
      return { url: this.serverUrl, client: this.client }
    }

    // Check if an existing server is running on default port 4096
    const defaultUrl = 'http://127.0.0.1:4096'
    try {
      const probe = await fetch(`${defaultUrl}/project`, { method: 'GET', signal: AbortSignal.timeout(1200) })
      if (probe.ok) {
        this.serverUrl = defaultUrl
        this.client = createOpencodeClient({ baseUrl: defaultUrl })
        return { url: defaultUrl, client: this.client }
      }
    } catch {
      // No server on 4096, will launch new instance
    }

    this.ensureBinPath()
    try {
      this.server = await createOpencodeServer({
        hostname: '127.0.0.1',
        port: 4096,
        timeout: 15000,
      })
      this.serverUrl = this.server.url
      this.client = createOpencodeClient({ baseUrl: this.server.url })
      return { url: this.serverUrl, client: this.client }
    } catch (err) {
      throw new Error(`Failed to start OpenCode headless server on 127.0.0.1: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /**
   * Subscribes to the server event stream for a workspace directory.
   */
  private async ensureEventStream(directory: string): Promise<void> {
    if (this.eventStreams.has(directory)) return

    const { client } = await this.ensureServer()
    try {
      const sseResult = await client.event.subscribe({ query: { directory } })
      let aborted = false
      const abortFn = () => {
        aborted = true
      }
      this.eventStreams.set(directory, { abort: abortFn })

      ;(async () => {
        try {
          for await (const rawEvent of sseResult.stream) {
            if (aborted) break
            this.handleRawEvent(rawEvent)
          }
        } catch {
          // Stream disconnected or aborted
        } finally {
          this.eventStreams.delete(directory)
        }
      })()
    } catch {
      // Event subscription failed
    }
  }

  private handleRawEvent(raw: unknown) {
    if (!raw || typeof raw !== 'object') return
    const rawObj = raw as Record<string, unknown>
    const type = typeof rawObj.type === 'string' ? rawObj.type : ''
    const props = (rawObj.properties && typeof rawObj.properties === 'object'
      ? rawObj.properties
      : {}) as Record<string, unknown>

    switch (type) {
      case 'message.part.delta': {
        if (props.sessionID && props.delta) {
          this.onEventCallback({
            type: 'text_delta',
            sessionId: String(props.sessionID),
            messageId: String(props.messageID || ''),
            delta: String(props.delta),
          })
        }
        break
      }

      case 'message.part.updated': {
        const part = props.part as Record<string, unknown> | undefined
        if (part && part.type === 'tool') {
          const toolName = String(part.tool || 'generic')
          const toolType = this.classifyToolType(toolName)
          const state = part.state as Record<string, unknown> | undefined
          const status = state?.status === 'running'
            ? 'running'
            : state?.status === 'error'
              ? 'failed'
              : 'completed'

          const activity: AgentToolActivity = {
            id: String(part.callID || part.id || `tool_${Date.now()}`),
            toolType,
            title: this.formatToolTitle(toolType, toolName, state?.input),
            detail: typeof state?.input === 'string' ? state.input : JSON.stringify(state?.input ?? null),
            status,
            startedAt: Date.now(),
            error: state?.error ? String(state.error) : undefined,
          }

          this.onEventCallback({
            type: 'tool_activity',
            sessionId: String(props.sessionID || part.sessionID || ''),
            activity,
          })
        }
        break
      }

      case 'file.edited': {
        if (props.file) {
          const filePath = String(props.file)
          this.onEventCallback({
            type: 'file_change',
            sessionId: String(props.sessionID || ''),
            path: filePath,
            changeType: 'modified',
          })
          this.onEventCallback({
            type: 'tool_activity',
            sessionId: String(props.sessionID || ''),
            activity: {
              id: `edit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              toolType: 'edit_file',
              title: `Edited ${path.basename(filePath)}`,
              detail: filePath,
              status: 'completed',
              startedAt: Date.now(),
            },
          })
        }
        break
      }

      case 'command.executed': {
        if (props.name) {
          this.onEventCallback({
            type: 'tool_activity',
            sessionId: String(props.sessionID || ''),
            activity: {
              id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              toolType: 'run_command',
              title: `Run ${String(props.name)}`,
              detail: props.arguments ? String(props.arguments) : undefined,
              status: 'completed',
              startedAt: Date.now(),
            },
          })
        }
        break
      }

      case 'session.status': {
        const statusObj = props.status as Record<string, unknown> | undefined
        const statusType = statusObj?.type
        if (props.sessionID) {
          if (statusType === 'busy') {
            this.onEventCallback({
              type: 'status',
              sessionId: String(props.sessionID),
              status: 'generating',
            })
          } else if (statusType === 'idle') {
            this.onEventCallback({
              type: 'status',
              sessionId: String(props.sessionID),
              status: 'idle',
            })
            this.onEventCallback({
              type: 'done',
              sessionId: String(props.sessionID),
            })
          }
        }
        break
      }

      case 'session.error': {
        if (props.sessionID) {
          this.onEventCallback({
            type: 'error',
            sessionId: String(props.sessionID),
            error: props.error ? (typeof props.error === 'object' ? JSON.stringify(props.error) : String(props.error)) : 'Unknown session error',
          })
        }
        break
      }
    }
  }

  private classifyToolType(toolName: string): ToolType {
    const lower = toolName.toLowerCase()
    if (lower.includes('read') || lower.includes('cat') || lower.includes('view')) return 'read_file'
    if (lower.includes('search') || lower.includes('grep') || lower.includes('find') || lower.includes('glob')) return 'search_codebase'
    if (lower.includes('bash') || lower.includes('cmd') || lower.includes('shell') || lower.includes('exec')) return 'run_command'
    if (lower.includes('edit') || lower.includes('write') || lower.includes('patch')) return 'edit_file'
    if (lower.includes('create') || lower.includes('touch')) return 'create_file'
    if (lower.includes('test') || lower.includes('jest') || lower.includes('vitest')) return 'run_tests'
    return 'generic'
  }

  private formatToolTitle(type: ToolType, name: string, input: unknown): string {
    const inputObj = input && typeof input === 'object' ? (input as Record<string, unknown>) : null
    const filename = inputObj?.path || inputObj?.file || inputObj?.filename
    if (filename) {
      if (type === 'read_file') return `Reading ${path.basename(String(filename))}`
      if (type === 'edit_file') return `Editing ${path.basename(String(filename))}`
      if (type === 'create_file') return `Creating ${path.basename(String(filename))}`
    }
    const query = inputObj?.pattern || inputObj?.query
    if (query && type === 'search_codebase') return `Searching for "${String(query).slice(0, 30)}"`
    const cmd = inputObj?.command || inputObj?.cmd
    if (cmd && type === 'run_command') return `Running: ${String(cmd).slice(0, 30)}`
    return `Executing tool: ${name}`
  }

  async checkAuth(): Promise<AgentAuthStatus> {
    try {
      const { client } = await this.ensureServer()
      const res = await client.provider.list()
      const data = res.data
      const connected = data?.connected ?? ['opencode']

      return {
        agentId: 'opencode',
        state: 'authenticated',
        connectedProviders: connected,
        details: 'Connected to local OpenCode engine. Built-in free community models are active with no API billing.',
        loginMethod: 'none',
      }
    } catch (err) {
      return {
        agentId: 'opencode',
        state: 'error',
        connectedProviders: [],
        details: `Unable to connect to OpenCode engine: ${err instanceof Error ? err.message : String(err)}`,
        loginMethod: 'none',
      }
    }
  }

  async listModels(): Promise<AgentModel[]> {
    const { client } = await this.ensureServer()
    const res = await client.provider.list()
    const data = res.data
    const results: AgentModel[] = []

    if (data?.all && Array.isArray(data.all)) {
      for (const provider of data.all) {
        if (!provider.models) continue
        const providerModels = provider.models as Record<
          string,
          {
            name?: string
            cost?: { input?: number; output?: number; cache?: { read?: number; write?: number } }
            limit?: { context?: number }
          }
        >
        for (const [modelKey, modelInfo] of Object.entries(providerModels)) {
          const cost = modelInfo.cost ?? { input: 0, output: 0 }
          const isFree = (cost.input === 0 && cost.output === 0)

          results.push({
            id: `${provider.id}/${modelKey}`,
            name: modelInfo.name || modelKey,
            providerId: provider.id,
            isFree,
            cost: {
              input: cost.input ?? 0,
              output: cost.output ?? 0,
              cacheRead: cost.cache?.read,
              cacheWrite: cost.cache?.write,
            },
            contextLimit: modelInfo.limit?.context,
          })
        }
      }
    }

    // Sort: built-in opencode provider free models first, then other free models, then paid
    results.sort((a, b) => {
      const aBuiltin = a.providerId === 'opencode' && a.isFree
      const bBuiltin = b.providerId === 'opencode' && b.isFree
      if (aBuiltin && !bBuiltin) return -1
      if (!aBuiltin && bBuiltin) return 1
      if (a.isFree && !b.isFree) return -1
      if (!a.isFree && b.isFree) return 1
      return a.name.localeCompare(b.name)
    })

    return results
  }

  async createSession(options: CreateSessionOptions): Promise<AgentSession> {
    const { client } = await this.ensureServer()
    await this.ensureEventStream(options.workspacePath)

    const res = await client.session.create({
      query: {
        directory: options.workspacePath,
      },
      body: {
        title: options.title || 'Forge AI Chat',
      },
    })

    if (!res.data?.id) {
      throw new Error('Failed to create OpenCode session: response did not include an ID.')
    }

    return {
      id: res.data.id,
      agentId: 'opencode',
      workspacePath: options.workspacePath,
      modelId: options.modelId || 'opencode/big-pickle',
      title: res.data.title || options.title,
      createdAt: res.data.time?.created ?? Date.now(),
    }
  }

  async submitPrompt(options: SubmitPromptOptions): Promise<void> {
    const { client } = await this.ensureServer()
    await this.ensureEventStream(options.workspacePath)

    // Parse model string: e.g. "opencode/big-pickle"
    let providerID = 'opencode'
    let modelID = 'big-pickle'
    if (options.modelId && options.modelId.includes('/')) {
      const parts = options.modelId.split('/')
      providerID = parts[0]
      modelID = parts.slice(1).join('/')
    }

    this.onEventCallback({
      type: 'status',
      sessionId: options.sessionId,
      status: 'generating',
      message: 'Submitting prompt to OpenCode...',
    })

    try {
      await client.session.promptAsync({
        path: { id: options.sessionId },
        query: { directory: options.workspacePath },
        body: {
          model: {
            providerID,
            modelID,
          },
          parts: [
            {
              type: 'text',
              text: options.prompt,
            },
          ],
        },
      })
    } catch (err) {
      this.onEventCallback({
        type: 'error',
        sessionId: options.sessionId,
        error: `Prompt failed: ${err instanceof Error ? err.message : String(err)}`,
      })
      throw err
    }
  }

  async cancel(sessionId: string, workspacePath?: string): Promise<void> {
    const { client } = await this.ensureServer()
    try {
      await client.session.abort({
        path: { id: sessionId },
        query: workspacePath ? { directory: workspacePath } : undefined,
      })
      this.onEventCallback({
        type: 'status',
        sessionId,
        status: 'aborted',
        message: 'Generation cancelled by user.',
      })
    } catch (err) {
      // Abort failed or already idle
    }
  }

  async dispose(): Promise<void> {
    for (const sub of this.eventStreams.values()) {
      sub.abort()
    }
    this.eventStreams.clear()

    if (this.server) {
      try {
        this.server.close()
      } catch {
        // Ignore
      }
      this.server = null
    }
    this.client = null
    this.serverUrl = null
  }
}
