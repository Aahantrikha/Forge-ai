import { useEffect, useRef, useState } from 'react'
import { AGENTS, getAgent, type AgentId } from '../app/agents'
import { EmptyState } from '../components/EmptyState'
import {
  ChatIcon,
  ChevronDownIcon,
  ForgeMark,
  PaperclipIcon,
  PlusIcon,
  SendIcon,
} from '../components/icons'

// ---------------------------------------------------------------------------
// Main chat view
// ---------------------------------------------------------------------------

interface ChatViewProps {
  selectedAgent: AgentId | null
  onSelectAgent: (id: AgentId | null) => void
}

/**
 * Chat-first conversation view.
 *
 * Milestone 1 scope: shell only. The composer is interactive, but no agent
 * adapter exists yet, so sending shows an honest notice and transmits
 * nothing — no simulated responses, no fake activity (§4, §5, §12).
 */
export function ChatView({ selectedAgent, onSelectAgent }: ChatViewProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (noticeTimer.current !== null) {
        window.clearTimeout(noticeTimer.current)
      }
    }
  }, [])

  const agent = getAgent(selectedAgent)

  const attemptSend = () => {
    const text = draft.trim()
    if (!text) return
    setNotice('No agent back-end is connected yet (Milestones 3–5). This message was not transmitted or stored.')
    if (noticeTimer.current !== null) {
      window.clearTimeout(noticeTimer.current)
    }
    noticeTimer.current = window.setTimeout(() => setNotice(null), 6000)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      attemptSend()
    }
  }

  return (
    <section className="view" aria-label="Chat">
      <header className="view-header">
        <h1 className="view-title">Chat</h1>
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
                    <span className="badge badge-planned">{entry.plannedMilestone}</span>
                  </span>
                  <span className="picker-item-note">{entry.integration} — not connected yet</span>
                </button>
              ))}
              {selectedAgent !== null ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="picker-item"
                  onClick={() => {
                    onSelectAgent(null)
                    setPickerOpen(false)
                  }}
                >
                  <span className="picker-item-top">
                    <span className="picker-item-name">None</span>
                  </span>
                  <span className="picker-item-note">Clear the selected agent</span>
                </button>
              ) : null}
              <div className="picker-foot">
                Agent integrations land in Milestones 3–5 with real authentication; nothing is selected for billing.
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {agent ? (
        <div className="callout callout-info chat-callout" role="note">
          <strong>{agent.name}</strong> is selected. No adapter is implemented yet — this arrives in{' '}
          {agent.plannedMilestone}. Messages are not dispatched and no activity is simulated.
        </div>
      ) : null}

      <div className="chat-messages">
        <div className="welcome-panel">
          <div className="welcome-mark">
            <ForgeMark size={24} />
          </div>
          <h2 className="welcome-title">Welcome to Forge AI</h2>
          <p className="welcome-sub">
            A local-first coding environment for multiple agents. Pick an agent, open a project, and let agents
            read, search, edit and run code inside your workspace.
          </p>
          <div className="agent-cards">
            {AGENTS.map((entry) => (
              <div key={entry.id} className="agent-card">
                <div className="agent-card-top">
                  <span className="agent-card-name">{entry.name}</span>
                  <span className="badge badge-planned">{entry.plannedMilestone}</span>
                </div>
                <span className="agent-card-integration">
                  {entry.integration} · {entry.needsApiKey ? 'requires API key' : 'no API key required'}
                </span>
              </div>
            ))}
          </div>
          <p className="welcome-footnote">
            Chat becomes live as agent adapters are integrated (OpenCode → Codex → Gemini). Until then nothing is
            sent, stored or simulated.
          </p>
        </div>
      </div>

      <div className="composer-wrap">
        {notice ? <div className="composer-notice" role="status">{notice}</div> : null}
        <div className="composer">
          <button
            type="button"
            className="composer-btn"
            disabled
            title="Prompt attachments arrive with agent integration (Milestone 3+)"
            aria-label="Attach files (not available yet)"
          >
            <PaperclipIcon size={16} />
          </button>
          <textarea
            className="composer-textarea"
            placeholder="Message Forge AI…"
            value={draft}
            rows={1}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            className="composer-btn composer-send"
            disabled={!draft.trim()}
            onClick={attemptSend}
            title="Send (no agent back-end connected yet)"
            aria-label="Send message"
          >
            <SendIcon size={16} />
          </button>
        </div>
        <p className="composer-hint">
          Enter to send · Shift+Enter for a new line · Sending is a no-op until agent adapters are integrated.
        </p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Chat sidebar
// ---------------------------------------------------------------------------

/** Sidebar for the chat view: session list placeholder + new-chat action. */
export function ChatSidebar({ onNewChat }: { onNewChat: () => void }) {
  return (
    <>
      <div className="sidebar-header">
        <span className="sidebar-title">Sessions</span>
        <button type="button" className="btn btn-sm btn-primary" onClick={onNewChat}>
          <PlusIcon size={13} />
          New chat
        </button>
      </div>
      <div className="sidebar-body">
        <div className="sidebar-section">
          <EmptyState
            compact
            icon={<ChatIcon size={26} />}
            title="No sessions yet"
            body="Conversation history and session persistence arrive in Milestone 8 (SQLite)."
            hint="Sessions will resume from stored provider session IDs once agents are wired up."
          />
        </div>
      </div>
    </>
  )
}
