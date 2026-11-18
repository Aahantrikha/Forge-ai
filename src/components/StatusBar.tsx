import { AGENTS, getAgent, type AgentId } from '../app/agents'
import type { OpenedFile, WorkspaceInfo } from '../shared/workspace'
import { FileIcon, FolderIcon } from './icons'

interface StatusBarProps {
  selectedAgent: AgentId | null
  workspace: WorkspaceInfo | null
  activeFile?: OpenedFile | null
  isDirty?: boolean
  onOpenFolder: () => void
}

/**
 * Bottom status bar: workspace status + per-agent availability.
 * Clicking the workspace button triggers the native folder picker.
 */
export function StatusBar({
  selectedAgent,
  workspace,
  activeFile,
  isDirty,
  onOpenFolder,
}: StatusBarProps) {
  const selected = getAgent(selectedAgent)

  return (
    <footer className="statusbar" aria-label="Status">
      <button
        type="button"
        className="status-item status-button"
        onClick={onOpenFolder}
        title={
          workspace
            ? `Active workspace: ${workspace.path} (Click to change folder)`
            : 'Click to select and open a project folder'
        }
      >
        <FolderIcon size={13} />
        <span className="status-workspace-name">
          {workspace ? workspace.name : 'No project open — Click to select'}
        </span>
      </button>

      {activeFile ? (
        <>
          <span className="status-sep" />
          <span className="status-item status-file-info" title={activeFile.path}>
            <FileIcon size={12} />
            <span>
              {activeFile.name} ({activeFile.lineCount} lines)
            </span>
            {isDirty ? <span className="status-dirty">Unsaved</span> : null}
          </span>
        </>
      ) : null}

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
