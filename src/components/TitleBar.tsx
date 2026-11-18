import type { WorkspaceInfo } from '../shared/workspace'
import { ForgeMark, SidebarToggleIcon } from './icons'

interface TitleBarProps {
  sidebarOpen: boolean
  workspace?: WorkspaceInfo | null
  activeFileName?: string | null
  isDirty?: boolean
  onToggleSidebar: () => void
}

/**
 * Top header bar: sidebar toggle, branding, milestone stage, and active workspace/file.
 * Native window controls are handled by the OS window frame.
 */
export function TitleBar({
  sidebarOpen,
  workspace,
  activeFileName,
  isDirty,
  onToggleSidebar,
}: TitleBarProps) {
  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <button
          type="button"
          className={`icon-btn${sidebarOpen ? ' is-on' : ''}`}
          onClick={onToggleSidebar}
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <SidebarToggleIcon size={16} />
        </button>
        <span className="brand-mark">
          <ForgeMark size={13} />
        </span>
        <span className="brand-name">Forge AI</span>
        <span className="brand-stage">Milestone 2</span>
        {workspace ? (
          <span className="titlebar-workspace-chip" title={workspace.path}>
            {workspace.name}
          </span>
        ) : null}
        {activeFileName ? (
          <span
            className={`titlebar-file-chip${isDirty ? ' is-dirty' : ''}`}
            title={isDirty ? `${activeFileName} — unsaved changes` : activeFileName}
          >
            {activeFileName}
            {isDirty ? <span className="dirty-dot" aria-label="Unsaved changes" /> : null}
          </span>
        ) : null}
      </div>
    </header>
  )
}
