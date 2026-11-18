import { useCallback, useEffect, useState } from 'react'
import { ActivityRail } from './components/ActivityRail'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { TitleBar } from './components/TitleBar'
import type { AgentId } from './app/agents'
import type { ViewId } from './app/navigation'
import type { FileTreeNode, OpenedFile, WorkspaceInfo } from './shared/workspace'
import { forgeApi } from './shared/bridge'
import { ChatView } from './views/ChatView'
import { HistoryView } from './views/HistoryView'
import { SettingsView } from './views/SettingsView'
import { WorkspaceView } from './views/WorkspaceView'

/**
 * App shell: title bar → [activity rail | sidebar | view] → status bar.
 * Milestone 2 delivers end-to-end folder & file management and content viewing.
 */
export default function App() {
  const [view, setView] = useState<ViewId>('chat')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<AgentId | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null)
  const [tree, setTree] = useState<FileTreeNode | null>(null)
  const [activeFile, setActiveFile] = useState<OpenedFile | null>(null)
  const [loadingTree, setLoadingTree] = useState(false)
  // Remount key resets the chat draft/notice when starting a new session.
  const [sessionKey, setSessionKey] = useState(0)

  const loadTree = useCallback(async (customPath?: string) => {
    if (!forgeApi?.workspace) return
    setLoadingTree(true)
    try {
      const rootNode = await forgeApi.workspace.getTree(customPath)
      setTree(rootNode ?? null)
    } finally {
      setLoadingTree(false)
    }
  }, [])

  // Load existing workspace / last recent project on start
  useEffect(() => {
    if (!forgeApi?.workspace) return
    let active = true
    void forgeApi.workspace
      .getCurrent()
      .then((current) => {
        if (active && current) {
          setWorkspace(current)
          void loadTree(current.path)
        }
      })
      .catch(() => {
        // Ignored in non-electron or initial load
      })
    return () => {
      active = false
    }
  }, [loadTree])

  // Watch for filesystem changes
  useEffect(() => {
    if (!forgeApi?.workspace) return
    const unsubscribe = forgeApi.workspace.onFileChanged(() => {
      void loadTree()
    })
    return () => {
      unsubscribe()
    }
  }, [loadTree])

  const handleOpenFolder = useCallback(async () => {
    if (!forgeApi?.workspace) return
    try {
      const result = await forgeApi.workspace.openFolder()
      if (result) {
        setWorkspace(result.workspace)
        setTree(result.tree)
        setActiveFile(null)
        setView('workspace')
      }
    } catch {
      // Failed to open folder
    }
  }, [])

  const handleOpenFile = useCallback(async () => {
    if (!forgeApi?.workspace) return
    try {
      const result = await forgeApi.workspace.openFile()
      if (result) {
        setActiveFile(result)
        setView('workspace')
      }
    } catch {
      // Failed to open file
    }
  }, [])

  const handleSelectFile = useCallback(async (node: FileTreeNode) => {
    if (!forgeApi?.workspace) return
    try {
      const result = await forgeApi.workspace.readFile(node.path)
      if (result) {
        setActiveFile(result)
        setView('workspace')
      }
    } catch {
      // Failed to read file
    }
  }, [])

  const handleCloseFile = () => {
    setActiveFile(null)
  }

  const handleSwitchWorkspace = async (targetPath: string) => {
    if (!forgeApi?.workspace) return
    try {
      const updated = await forgeApi.workspace.setCurrent(targetPath)
      if (updated) {
        setWorkspace(updated)
        await loadTree(targetPath)
        setActiveFile(null)
        setView('workspace')
      }
    } catch {
      // Failed to switch workspace
    }
  }

  // Subscribe to native menu bar actions (File > Open Folder, File > Open File)
  useEffect(() => {
    if (!forgeApi?.workspace) return
    const unsubFolder = forgeApi.workspace.onMenuOpenFolder(() => {
      void handleOpenFolder()
    })
    const unsubFile = forgeApi.workspace.onMenuOpenFile(() => {
      void handleOpenFile()
    })
    return () => {
      unsubFolder()
      unsubFile()
    }
  }, [handleOpenFolder, handleOpenFile])

  const startNewSession = () => {
    setSessionKey((key) => key + 1)
    setView('chat')
  }

  return (
    <div className="shell">
      <TitleBar
        sidebarOpen={sidebarOpen}
        workspace={workspace}
        activeFileName={activeFile?.name ?? null}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
      />
      <div className={`shell-body${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
        <ActivityRail
          activeView={view}
          workspace={workspace}
          onSelect={setView}
          onNewChat={startNewSession}
          onOpenFolder={handleOpenFolder}
        />
        {sidebarOpen ? (
          <Sidebar
            view={view}
            workspace={workspace}
            tree={tree}
            activeFile={activeFile}
            loading={loadingTree}
            onNewChat={startNewSession}
            onOpenFolder={handleOpenFolder}
            onOpenFile={handleOpenFile}
            onSelectFile={handleSelectFile}
            onRefreshTree={() => loadTree()}
            onSwitchWorkspace={handleSwitchWorkspace}
          />
        ) : null}
        <main className="view-host">
          {view === 'chat' ? (
            <ChatView
              key={sessionKey}
              selectedAgent={selectedAgent}
              onSelectAgent={setSelectedAgent}
              workspace={workspace}
              onOpenFolder={handleOpenFolder}
            />
          ) : null}
          {view === 'workspace' ? (
            <WorkspaceView
              workspace={workspace}
              tree={tree}
              activeFile={activeFile}
              loading={loadingTree}
              onOpenFolder={handleOpenFolder}
              onOpenFile={handleOpenFile}
              onSelectFile={handleSelectFile}
              onCloseFile={handleCloseFile}
              onRefreshTree={() => loadTree()}
              onSwitchWorkspace={handleSwitchWorkspace}
            />
          ) : null}
          {view === 'history' ? <HistoryView /> : null}
          {view === 'settings' ? <SettingsView /> : null}
        </main>
      </div>
      <StatusBar
        selectedAgent={selectedAgent}
        workspace={workspace}
        activeFile={activeFile}
        onOpenFolder={handleOpenFolder}
      />
    </div>
  )
}
