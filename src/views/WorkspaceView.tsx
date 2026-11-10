import { EmptyState } from '../components/EmptyState'
import { FolderIcon, TerminalIcon } from '../components/icons'

/**
 * Workspace view — Milestone 2 will deliver project open/create/switch,
 * file browsing and the integrated terminal. Renders an honest launcher
 * placeholder until the main-process workspace service exists (§3).
 */
export function WorkspaceView() {
  return (
    <section className="view" aria-label="Workspace">
      <header className="view-header">
        <h1 className="view-title">Workspace</h1>
        <span className="view-sub">Projects and files — planned for Milestone 2</span>
      </header>
      <div className="centered-content">
        <div className="panel project-launcher">
          <span className="launcher-icon">
            <FolderIcon size={34} />
          </span>
          <h2>Open a project</h2>
          <p className="launcher-body">
            Agents operate in exactly one local workspace at a time. Everything — file browsing, edits, terminal
            commands and agent tool activity — is scoped to the selected project root.
          </p>
          <button type="button" className="btn btn-primary" disabled>
            Open project…
          </button>
          <p className="launcher-hint">Not implemented yet — workspace management arrives in Milestone 2.</p>
        </div>
        <ul className="feature-list">
          <li><FeatureBullet />Browse files &amp; folder structure</li>
          <li><FeatureBullet />Track modified files</li>
          <li><FeatureBullet />Open files from the tree</li>
          <li><FeatureBullet />Integrated terminal via xterm.js + node-pty</li>
          <li><FeatureBullet />Launch a terminal in the project directory</li>
        </ul>
      </div>
    </section>
  )
}

function FeatureBullet() {
  return <span className="feature-dot" aria-hidden="true" />
}

/** Sidebar for the workspace view. */
export function WorkspaceSidebar() {
  return (
    <>
      <div className="sidebar-header">
        <span className="sidebar-title">Project</span>
      </div>
      <div className="sidebar-body">
        <div className="sidebar-section">
          <EmptyState
            compact
            icon={<FolderIcon size={26} />}
            title="No project open"
            body="Open or create a project to browse its files. Project selection lands in Milestone 2."
          />
        </div>
        <div className="sidebar-section">
          <span className="sidebar-title">Recent projects</span>
          <EmptyState
            compact
            icon={<TerminalIcon size={24} />}
            title="Nothing here yet"
            body="Recent projects appear after your first workspace (Milestone 2)."
          />
        </div>
      </div>
    </>
  )
}
