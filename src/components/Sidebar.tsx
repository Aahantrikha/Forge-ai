import type { ViewId } from '../app/navigation'
import type { WorkspaceInfo } from '../shared/workspace'
import { ChatSidebar } from '../views/ChatView'
import { HistorySidebar } from '../views/HistoryView'
import { SettingsSidebar } from '../views/SettingsView'
import { WorkspaceSidebar } from '../views/WorkspaceView'

interface SidebarProps {
  view: ViewId
  workspace: WorkspaceInfo | null
  /** Passed through to sidebars that need the global new-chat action. */
  onNewChat: () => void
  onSelectDirectory: () => Promise<void>
  onSwitchWorkspace: (path: string) => Promise<void>
}

/** Contextual sidebar: content is owned by each view module and rendered by view id. */
export function Sidebar({ view, workspace, onNewChat, onSelectDirectory, onSwitchWorkspace }: SidebarProps) {
  return (
    <div className="sidebar">
      {view === 'chat' ? (
        <ChatSidebar onNewChat={onNewChat} />
      ) : view === 'workspace' ? (
        <WorkspaceSidebar
          workspace={workspace}
          onSelectDirectory={onSelectDirectory}
          onSwitchWorkspace={onSwitchWorkspace}
        />
      ) : view === 'history' ? (
        <HistorySidebar />
      ) : (
        <SettingsSidebar />
      )}
    </div>
  )
}
