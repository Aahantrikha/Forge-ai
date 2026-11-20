import { useCallback, useEffect, useRef, useState } from 'react'
import { AGENTS, getAgent, type AgentId } from '../app/agents'
import { EmptyState } from '../components/EmptyState'
import { AgentActivityCard } from '../components/AgentActivityCard'
import { MarkdownMessage } from '../components/MarkdownMessage'
import {
  ChatIcon,
  ChevronDownIcon,
  ForgeMark,
  FolderIcon,
  PaperclipIcon,
  PlusIcon,
  SendIcon,
  StopIcon,
  UserIcon,
} from '../components/icons'
import type {
  AgentAuthStatus,
  AgentEvent,
  AgentModel,
  AgentSession,
  AgentToolActivity,
} from '../shared/agent'
import type { WorkspaceInfo } from '../shared/workspace'
import { forgeApi } from '../shared/bridge'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  activities?: AgentToolActivity[]
  status?: 'pending' | 'streaming' | 'done' | 'aborted' | 'error'
  error?: string
}

interface ChatViewProps {
  selectedAgent: AgentId | null
  onSelectAgent: (id: AgentId | null) => void
  activeSession: AgentSession | null
  onActiveSessionChange: (session: AgentSession | null) => void
  selectedModel: string
  onSelectModel: (modelId: string) => void
  workspace: WorkspaceInfo | null
  onOpenFolder: () => void
}

/**
 * Chat-first conversation view (Forge AI Milestone 3).
 *
 * Provides real multi-turn conversation with OpenCode via the official TypeScript SDK.
 * - Streams responses in real-time.
 * - Displays authentic tool activities and file changes.
 * - Supports model selection with free models clearly separated and prioritized.
 * - Supports instant cancellation / stop generation.
 */
export function ChatView({
  selectedAgent,
  onSelectAgent,
  activeSession,
  onActiveSessionChange,
  selectedModel,
  onSelectModel,
  workspace,
  onOpenFolder,
}: ChatViewProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [models, setModels] = useState<AgentModel[]>([])
  const [authStatus, setAuthStatus] = useState<AgentAuthStatus | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const noticeTimer = useRef<number | null>(null)

  const agent = getAgent(selectedAgent)

  // Scroll to bottom on new messages or deltas
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, isGenerating, scrollToBottom])

  // Clear notice timer on unmount
  useEffect(() => {
    return () => {
      if (noticeTimer.current !== null) {
        window.clearTimeout(noticeTimer.current)
      }
    }
  }, [])

  // Auto-select OpenCode if none selected, or load agent metadata
  useEffect(() => {
    if (selectedAgent === null) {
      onSelectAgent('opencode')
    }
  }, [selectedAgent, onSelectAgent])

  // Load models and auth status when OpenCode is active
  useEffect(() => {
    if (!forgeApi?.agent || selectedAgent !== 'opencode') return

    let active = true
    void forgeApi.agent
      .checkAuth('opencode')
      .then((status) => {
        if (active) setAuthStatus(status)
      })
      .catch(() => {
        // Auth check error
      })

    void forgeApi.agent
      .listModels('opencode')
      .then((modelList) => {
        if (!active) return
        setModels(modelList)
        // Pick the first free model as default if available
        if (!modelList.some((model) => model.id === selectedModel)) {
          const defaultFree = modelList.find((m) => m.isFree)
          if (defaultFree) {
            onSelectModel(defaultFree.id)
          }
        }
      })
      .catch(() => {
        // Model list error
      })

    return () => {
      active = false
    }
  }, [selectedAgent, selectedModel, onSelectModel])

  // Subscribe to real agent events from the main process
  useEffect(() => {
    if (!forgeApi?.agent) return

    const unsubscribe = forgeApi.agent.onEvent((event: AgentEvent) => {
      switch (event.type) {
        case 'text_delta': {
          setMessages((prev) => {
            const copy = [...prev]
            const last = copy[copy.length - 1]
            if (last && last.role === 'assistant') {
              copy[copy.length - 1] = {
                ...last,
                content: last.content + event.delta,
                status: 'streaming',
              }
              return copy
            }
            return prev
          })
          break
        }

        case 'tool_activity': {
          setMessages((prev) => {
            const copy = [...prev]
            const last = copy[copy.length - 1]
            if (last && last.role === 'assistant') {
              const existingActivities = last.activities ? [...last.activities] : []
              const idx = existingActivities.findIndex((a) => a.id === event.activity.id)
              if (idx >= 0) {
                existingActivities[idx] = event.activity
              } else {
                existingActivities.push(event.activity)
              }
              copy[copy.length - 1] = {
                ...last,
                activities: existingActivities,
              }
              return copy
            }
            return prev
          })
          break
        }

        case 'status': {
          if (event.status === 'generating') {
            setIsGenerating(true)
          } else if (event.status === 'idle') {
            setIsGenerating(false)
          } else if (event.status === 'aborted') {
            setIsGenerating(false)
            setMessages((prev) => {
              const copy = [...prev]
              const last = copy[copy.length - 1]
              if (last && last.role === 'assistant') {
                copy[copy.length - 1] = { ...last, status: 'aborted' }
                return copy
              }
              return prev
            })
          }
          break
        }

        case 'done': {
          setIsGenerating(false)
          setMessages((prev) => {
            const copy = [...prev]
            const last = copy[copy.length - 1]
            if (last && last.role === 'assistant') {
              copy[copy.length - 1] = { ...last, status: 'done' }
              return copy
            }
            return prev
          })
          break
        }

        case 'error': {
          setIsGenerating(false)
          setMessages((prev) => {
            const copy = [...prev]
            const last = copy[copy.length - 1]
            if (last && last.role === 'assistant') {
              copy[copy.length - 1] = {
                ...last,
                status: 'error',
                error: event.error,
              }
              return copy
            }
            return prev
          })
          break
        }
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  const showNotice = (msg: string) => {
    setNotice(msg)
    if (noticeTimer.current !== null) {
      window.clearTimeout(noticeTimer.current)
    }
    noticeTimer.current = window.setTimeout(() => setNotice(null), 6000)
  }

  const handleSend = async () => {
    const text = draft.trim()
    if (!text || isGenerating) return

    if (!selectedAgent) {
      showNotice('Please select an agent first.')
      return
    }

    if (selectedAgent !== 'opencode') {
      showNotice(`${agent?.name} adapter arrives in ${agent?.plannedMilestone}. Switch to OpenCode to prompt now.`)
      return
    }

    if (!workspace) {
      showNotice('Please open a workspace folder so OpenCode can read and edit project files.')
      return
    }

    if (!forgeApi?.agent) {
      showNotice('Forge AI agent service is unavailable in browser preview mode.')
      return
    }

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }

    const assistantPlaceholder: ChatMessage = {
      id: `assistant_${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'pending',
      activities: [],
    }

    setMessages((prev) => [...prev, userMessage, assistantPlaceholder])
    setDraft('')
    setIsGenerating(true)

    try {
      let session = activeSession
      if (!session || session.workspacePath !== workspace.path) {
        session = await forgeApi.agent.createSession('opencode', {
          workspacePath: workspace.path,
          modelId: selectedModel,
          title: text.slice(0, 40),
        })
        onActiveSessionChange(session)
      }

      await forgeApi.agent.submitPrompt('opencode', {
        sessionId: session.id,
        prompt: text,
        modelId: selectedModel,
        workspacePath: workspace.path,
      })
    } catch (err) {
      setIsGenerating(false)
      const errorMsg = err instanceof Error ? err.message : String(err)
      setMessages((prev) => {
        const copy = [...prev]
        const last = copy[copy.length - 1]
        if (last && last.role === 'assistant') {
          copy[copy.length - 1] = {
            ...last,
            status: 'error',
            error: errorMsg,
          }
          return copy
        }
        return prev
      })
    }
  }

  const handleStop = async () => {
    if (!forgeApi?.agent || !activeSession || !isGenerating) return
    try {
      await forgeApi.agent.cancel('opencode', activeSession.id, workspace?.path)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSend()
    }
  }

  const currentModelObj = models.find((m) => m.id === selectedModel)
  const isFreeModel = currentModelObj ? currentModelObj.isFree : true

  return (
    <section className="view" aria-label="Chat">
      <header className="view-header">
        <h1 className="view-title">Chat</h1>

        <div className="model-picker-wrap">
          {/* Agent Selector */}
          <div className="agent-picker">
            {pickerOpen ? <div className="picker-backdrop" onClick={() => setPickerOpen(false)} /> : null}
            <button
              type="button"
              className="picker-btn"
              onClick={() => setPickerOpen((open) => !open)}
              aria-haspopup="listbox"
              aria-expanded={pickerOpen}
              title="Select agent"
            >
              <span className="picker-label">{agent ? agent.name : 'Select agent'}</span>
              <span className="picker-chevron">
                <ChevronDownIcon size={14} />
              </span>
            </button>
            {pickerOpen ? (
              <div className="picker-menu" role="listbox" aria-label="Agents">
                {AGENTS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="option"
                    aria-selected={entry.id === selectedAgent}
                    className={`picker-item${entry.id === selectedAgent ? ' selected' : ''}`}
                    onClick={() => {
                      onSelectAgent(entry.id)
                      setPickerOpen(false)
                    }}
                  >
                    <span className="picker-item-top">
                      <span className="picker-item-name">{entry.name}</span>
                      <span className={`badge ${entry.status === 'available' ? 'badge-primary' : 'badge-planned'}`}>
                        {entry.status === 'available' ? 'Available' : entry.plannedMilestone}
                      </span>
                    </span>
                    <span className="picker-item-note">
                      {entry.status === 'available'
                        ? 'Connected via OpenCode TypeScript SDK · Free models active'
                        : `${entry.integration} · not connected yet`}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* Model Selector (Available for OpenCode) */}
          {selectedAgent === 'opencode' && (
            <div className="model-picker">
              {modelPickerOpen ? (
                <div className="picker-backdrop" onClick={() => setModelPickerOpen(false)} />
              ) : null}
              <button
                type="button"
                className="model-btn"
                onClick={() => setModelPickerOpen((open) => !open)}
                title="Select model"
              >
                <span className="model-btn-label">
                  {currentModelObj ? currentModelObj.name : selectedModel.split('/')[1] || selectedModel}
                </span>
                <span className={isFreeModel ? 'badge-free' : 'badge-paid'}>
                  {isFreeModel ? 'FREE' : 'PAID'}
                </span>
                <ChevronDownIcon size={12} />
              </button>
              {modelPickerOpen && (
                <div className="model-dropdown">
                  <div className="model-dropdown-section-title">Free Models (Zero API Cost)</div>
                  {models
                    .filter((m) => m.isFree)
                    .map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`model-dropdown-item${m.id === selectedModel ? ' selected' : ''}`}
                        onClick={() => {
                          onSelectModel(m.id)
                          setModelPickerOpen(false)
                        }}
                      >
                        <span>{m.name}</span>
                        <span className="badge-free">FREE</span>
                      </button>
                    ))}
                  {models.some((m) => !m.isFree) && (
                    <>
                      <div className="model-dropdown-section-title">Paid Models (External Providers)</div>
                      {models
                        .filter((m) => !m.isFree)
                        .slice(0, 8)
                        .map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className={`model-dropdown-item${m.id === selectedModel ? ' selected' : ''}`}
                            onClick={() => {
                              onSelectModel(m.id)
                              setModelPickerOpen(false)
                            }}
                          >
                            <span>{m.name}</span>
                            <span className="badge-paid">PAID</span>
                          </button>
                        ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Notice Callout for future agents */}
      {selectedAgent && selectedAgent !== 'opencode' ? (
        <div className="callout callout-info chat-callout" role="note">
          <strong>{agent?.name}</strong> is scheduled for {agent?.plannedMilestone}. Switch to{' '}
          <strong>OpenCode</strong> to prompt right now with free models.
        </div>
      ) : null}

      {/* Workspace Warning Banner if no project is open */}
      {!workspace && selectedAgent === 'opencode' ? (
        <div className="workspace-notice-banner" role="alert">
          <span>
            <strong>No workspace project open.</strong> Open a folder so OpenCode can read, search, and edit your code.
          </span>
          <button type="button" className="btn btn-sm btn-primary" onClick={onOpenFolder}>
            <FolderIcon size={13} />
            Open Folder
          </button>
        </div>
      ) : null}

      {/* Messages Stream */}
      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="welcome-panel">
            <div className="welcome-mark">
              <ForgeMark size={24} />
            </div>
            <h2 className="welcome-title">Forge AI Coding Assistant</h2>
            <p className="welcome-sub">
              Interact with autonomous coding agents using your local subscriptions and free community models.
            </p>
            <div className="agent-cards">
              {AGENTS.map((entry) => (
                <div
                  key={entry.id}
                  className={`agent-card${entry.id === selectedAgent ? ' selected' : ''}`}
                  onClick={() => onSelectAgent(entry.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="agent-card-top">
                    <span className="agent-card-name">{entry.name}</span>
                    <span className={`badge ${entry.status === 'available' ? 'badge-primary' : 'badge-planned'}`}>
                      {entry.status === 'available' ? 'Ready' : entry.plannedMilestone}
                    </span>
                  </div>
                  <span className="agent-card-integration">
                    {entry.integration} · {entry.needsApiKey ? 'API key required' : 'zero API billing'}
                  </span>
                </div>
              ))}
            </div>
            {authStatus && (
              <p className="welcome-footnote">
                Engine Status: {authStatus.details}
              </p>
            )}
          </div>
        ) : (
          <div className="chat-conversation">
            {messages.map((msg) => (
              <div key={msg.id} className={`chat-message-row ${msg.role}`}>
                <div className={`chat-avatar ${msg.role}`}>
                  {msg.role === 'user' ? <UserIcon size={16} /> : <ForgeMark size={16} />}
                </div>
                <div className="chat-message-content">
                  <div className="chat-message-meta">
                    <span className="chat-message-author">
                      {msg.role === 'user' ? 'You' : agent?.name || 'Assistant'}
                    </span>
                    <span className="chat-message-time">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Real Tool Activities */}
                  {msg.activities && msg.activities.length > 0 && (
                    <div className="agent-activity-list">
                      {msg.activities.map((activity) => (
                        <AgentActivityCard key={activity.id} activity={activity} />
                      ))}
                    </div>
                  )}

                  {/* Message Bubble */}
                  <div className="chat-message-bubble">
                    {msg.content ? (
                      <MarkdownMessage content={msg.content} />
                    ) : msg.status === 'pending' || msg.status === 'streaming' ? (
                      <div className="activity-status-badge running">
                        <span className="activity-spinner" />
                        <span>Generating response...</span>
                      </div>
                    ) : msg.error ? (
                      <div className="activity-error">
                        <strong>Error:</strong> {msg.error}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="composer-wrap">
        {notice ? <div className="composer-notice" role="status">{notice}</div> : null}
        <div className="composer">
          <button
            type="button"
            className="composer-btn"
            disabled
            title="Prompt attachments arrive in Milestone 6"
            aria-label="Attach files (planned for Milestone 6)"
          >
            <PaperclipIcon size={16} />
          </button>
          <textarea
            className="composer-textarea"
            placeholder={
              !workspace
                ? 'Open a project folder to start chatting with OpenCode…'
                : isGenerating
                  ? 'Agent is responding…'
                  : 'Ask OpenCode to explain code, fix bugs, or implement features…'
            }
            value={draft}
            rows={1}
            disabled={isGenerating}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          {isGenerating ? (
            <button
              type="button"
              className="composer-btn composer-stop"
              onClick={handleStop}
              title="Stop generation"
              aria-label="Stop generation"
            >
              <StopIcon size={14} />
            </button>
          ) : (
            <button
              type="button"
              className="composer-btn composer-send"
              disabled={!draft.trim()}
              onClick={() => void handleSend()}
              title="Send prompt"
              aria-label="Send message"
            >
              <SendIcon size={16} />
            </button>
          )}
        </div>
        <p className="composer-hint">
          Enter to send · Shift+Enter for new line · {isFreeModel ? 'Free model (0 API cost)' : 'Paid model'}
        </p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Chat sidebar
// ---------------------------------------------------------------------------

interface ChatSidebarProps {
  onNewChat: () => void
  activeSession?: AgentSession | null
  newChatDisabled?: boolean
}

/** Sidebar for the chat view: session details + new-chat action. */
export function ChatSidebar({ onNewChat, activeSession, newChatDisabled = false }: ChatSidebarProps) {
  return (
    <>
      <div className="sidebar-header">
        <span className="sidebar-title">Sessions</span>
        <button type="button" className="btn btn-sm btn-primary" onClick={onNewChat} disabled={newChatDisabled} title="Start new session">
          <PlusIcon size={13} />
          New chat
        </button>
      </div>
      <div className="sidebar-body">
        {activeSession ? (
          <div className="sidebar-section">
            <span className="sidebar-label">Active Session</span>
            <div className="active-session-card" style={{ padding: '8px 10px', background: 'var(--bg-panel)', borderRadius: '6px', fontSize: '12px' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                {activeSession.title || 'Current Chat'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: 2 }}>
                Model: <strong>{activeSession.modelId}</strong>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Folder: {activeSession.workspacePath.split('\\').pop() || activeSession.workspacePath}
              </div>
            </div>
          </div>
        ) : null}
        <div className="sidebar-section">
          <EmptyState
            compact
            icon={<ChatIcon size={26} />}
            title="Session Active"
            body="Sessions are live and stream directly through the OpenCode TypeScript SDK."
            hint="Multi-session persistence & history list arrive in Milestone 8 (SQLite)."
          />
        </div>
      </div>
    </>
  )
}
