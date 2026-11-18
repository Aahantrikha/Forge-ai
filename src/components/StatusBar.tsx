import { AGENTS, getAgent, type AgentId } from '../app/agents'
import type { WorkspaceInfo } from '../shared/workspace'
import { FolderIcon } from './icons'

interface StatusBarProps {
  selectedAgent: AgentId | null
  workspace: WorkspaceInfo | null
  onOpenWorkspace: () => void
}

/**
 * Bottom status bar: workspace status + per-agent availability.
 * Reflects active project path and real registry state.
 */
export function StatusBar({ selectedAgent, workspace, onOpenWorkspace }: StatusBarProps) {
  const selected = getAgent(selectedAgent)

  return (
    <footer className="statusbar" aria-label="Status">
      <button
        type="button"
        className="status-item status-button"
        onClick={onOpenWorkspace}
        title={workspace ? `Workspace: ${workspace.path}` : 'Click to select project folder'}
      >
        <FolderIcon size={13} />
        <span className="status-workspace-name">
          {workspace ? workspace.name : 'No project open — Click to select'}
        </span>
      </button>
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
