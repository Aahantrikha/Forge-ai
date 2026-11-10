import { EmptyState } from '../components/EmptyState'
import { DatabaseIcon, HistoryIcon } from '../components/icons'

/**
 * Conversation history index. Empty by design in Milestone 1: there is no
 * persistence layer yet, and the UI never fabricates past sessions (§5, §10).
 */
export function HistoryView() {
  return (
    <section className="view" aria-label="History">
      <header className="view-header">
        <h1 className="view-title">History</h1>
        <span className="view-sub">Conversation history — persistence arrives in Milestone 8</span>
      </header>
      <div className="centered-content">
        <EmptyState
          icon={<HistoryIcon size={36} />}
          title="No conversation history yet"
          body="Completed sessions will be listed here with agent, project and timestamps once persistence lands."
          hint="Not implemented yet — nothing is recorded in this milestone."
        />
      </div>
    </section>
  )
}

/** Sidebar for the history view. */
export function HistorySidebar() {
  return (
    <>
      <div className="sidebar-header">
        <span className="sidebar-title">Archive</span>
      </div>
      <div className="sidebar-body">
        <div className="sidebar-section">
          <EmptyState
            compact
            icon={<DatabaseIcon size={24} />}
            title="No stored sessions"
            body="History is backed by SQLite from Milestone 8 onward. Until then this list stays empty by design."
          />
        </div>
      </div>
    </>
  )
}
