import type { ViewId } from '../app/navigation'
import { ChatSidebar } from '../views/ChatView'
import { HistorySidebar } from '../views/HistoryView'
import { SettingsSidebar } from '../views/SettingsView'
import { WorkspaceSidebar } from '../views/WorkspaceView'

interface SidebarProps {
  view: ViewId
  /** Passed through to sidebars that need the global new-chat action. */
  onNewChat: () => void
}

/** Contextual sidebar: content is owned by each view module and rendered by view id. */
export function Sidebar({ view, onNewChat }: SidebarProps) {
  return (
    <div className="sidebar">
      {view === 'chat' ? (
        <ChatSidebar onNewChat={onNewChat} />
      ) : view === 'workspace' ? (
        <WorkspaceSidebar />
      ) : view === 'history' ? (
        <HistorySidebar />
      ) : (
        <SettingsSidebar />
      )}
    </div>
  )
}
