import { AGENTS, getAgent, type AgentId } from '../app/agents'
import { FolderIcon } from './icons'

interface StatusBarProps {
  selectedAgent: AgentId | null
}

/**
 * Bottom status bar: workspace status + per-agent availability.
 * The agent chips reflect the real registry state — "planned" until an
 * adapter actually ships (§5: never fabricate availability).
 */
export function StatusBar({ selectedAgent }: StatusBarProps) {
  const selected = getAgent(selectedAgent)

  return (
    <footer className="statusbar" aria-label="Status">
      <span className="status-item">
        <FolderIcon size={13} />
        No project open — workspace management arrives in Milestone 2
      </span>
      <span className="status-sep" />
      <div className="statusbar-agents">
        <span className="status-item">Agents:</span>
        {AGENTS.map((agent) => (
          <span
            key={agent.id}
            className={`status-agent${agent.id === selectedAgent ? ' selected' : ''}`}
            title={agent.notes}
          >
            <span className={`status-dot${agent.id === selectedAgent ? ' accent' : ''}`} />
            {agent.name} · {selected?.id === agent.id ? 'selected' : agent.status}
          </span>
        ))}
      </div>
    </footer>
  )
}
