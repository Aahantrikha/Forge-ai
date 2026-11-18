import type { ViewId } from '../app/navigation'
import type { FileTreeNode, OpenedFile, WorkspaceEntry, WorkspaceInfo, WorkspaceResult } from '../shared/workspace'
import { ChatSidebar } from '../views/ChatView'
import { HistorySidebar } from '../views/HistoryView'
import { SettingsSidebar } from '../views/SettingsView'
import { WorkspaceSidebar } from '../views/WorkspaceView'

interface SidebarProps {
  view: ViewId
  workspace: WorkspaceInfo | null
  tree: FileTreeNode | null
  activeFile: OpenedFile | null
  loading: boolean
  /** Passed through to sidebars that need the global new-chat action. */
  onNewChat: () => void
  onOpenFolder: () => Promise<void>
  onOpenFile: () => Promise<void>
  onSelectFile: (node: FileTreeNode) => Promise<void>
  onRefreshTree: () => Promise<void>
  onSwitchWorkspace: (path: string) => Promise<void>
  onCreateEntry: (parentPath: string, name: string, type: 'file' | 'directory') => Promise<WorkspaceResult<WorkspaceEntry> | null>
  onRenameEntry: (entryPath: string, newName: string) => Promise<WorkspaceResult<WorkspaceEntry> | null>
  onDeleteEntry: (entryPath: string) => Promise<void>
}

/** Contextual sidebar: content is owned by each view module and rendered by view id. */
export function Sidebar({
  view,
  workspace,
  tree,
  activeFile,
  loading,
  onNewChat,
  onOpenFolder,
  onOpenFile,
  onSelectFile,
  onRefreshTree,
  onSwitchWorkspace,
  onCreateEntry,
  onRenameEntry,
  onDeleteEntry,
}: SidebarProps) {
  return (
    <div className="sidebar">
      {view === 'chat' ? (
        <ChatSidebar onNewChat={onNewChat} />
      ) : view === 'workspace' ? (
        <WorkspaceSidebar
          workspace={workspace}
          tree={tree}
          activeFile={activeFile}
          loading={loading}
          onOpenFolder={onOpenFolder}
          onOpenFile={onOpenFile}
          onSelectFile={onSelectFile}
          onRefreshTree={onRefreshTree}
          onSwitchWorkspace={onSwitchWorkspace}
          onCreateEntry={onCreateEntry}
          onRenameEntry={onRenameEntry}
          onDeleteEntry={onDeleteEntry}
        />
      ) : view === 'history' ? (
        <HistorySidebar />
      ) : (
        <SettingsSidebar />
      )}
    </div>
  )
}
