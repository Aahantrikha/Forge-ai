import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityRail } from './components/ActivityRail'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { TitleBar } from './components/TitleBar'
import type { AgentId } from './app/agents'
import type { ViewId } from './app/navigation'
import type {
  FileChangeEvent,
  FileState,
  FileTreeNode,
  OpenedFile,
  WorkspaceEntry,
  WorkspaceInfo,
  WorkspaceResult,
} from './shared/workspace'
import { forgeApi } from './shared/bridge'
import { ChatView } from './views/ChatView'
import { HistoryView } from './views/HistoryView'
import { SettingsView } from './views/SettingsView'
import { WorkspaceView } from './views/WorkspaceView'

type Notice = { tone: 'error' | 'success' | 'info'; text: string }

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').toLowerCase()
}

export default function App() {
  const [view, setView] = useState<ViewId>('chat')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<AgentId | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null)
  const [tree, setTree] = useState<FileTreeNode | null>(null)
  const [activeFile, setActiveFile] = useState<OpenedFile | null>(null)
  const [draftPath, setDraftPath] = useState<string | null>(null)
  const [draftContent, setDraftContent] = useState('')
  const [loadingTree, setLoadingTree] = useState(false)
  const [savePhase, setSavePhase] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [externalConflict, setExternalConflict] = useState<FileState | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [sessionKey, setSessionKey] = useState(0)
  const saveInFlightRef = useRef(false)

  const dirty = !!activeFile && draftPath === activeFile.path && draftContent !== activeFile.content
  const dirtyRef = useRef(dirty)
  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  const loadTree = useCallback(async (customPath?: string) => {
    if (!forgeApi?.workspace) return
    setLoadingTree(true)
    try {
      const rootNode = await forgeApi.workspace.getTree(customPath)
      setTree(rootNode ?? null)
    } catch {
      setNotice({ tone: 'error', text: 'Could not refresh the file tree.' })
    } finally {
      setLoadingTree(false)
    }
  }, [])

  const adoptFile = useCallback((file: OpenedFile | null) => {
    setActiveFile(file)
    setDraftPath(file?.path ?? null)
    setDraftContent(file?.content ?? '')
    setExternalConflict(null)
    setSavePhase('idle')
  }, [])

  const openPath = useCallback(
    async (filePath: string): Promise<OpenedFile | null> => {
      if (!forgeApi?.workspace) return null
      try {
        const result = await forgeApi.workspace.readFile(filePath)
        if (result) adoptFile(result)
        return result
      } catch {
        setNotice({ tone: 'error', text: 'Could not open the file.' })
        return null
      }
    },
    [adoptFile]
  )

  const confirmDiscard = useCallback(() => {
    return !dirtyRef.current || window.confirm('You have unsaved changes. Discard them?')
  }, [])

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
        return
      })
    return () => {
      active = false
    }
  }, [loadTree])

  const checkActiveFile = useCallback(async () => {
    if (!forgeApi?.workspace || !activeFile) return
    try {
      const result = await forgeApi.workspace.getFileState(activeFile.path)
      if (!result.ok) {
        if (!dirtyRef.current && result.error.code === 'NOT_FOUND') adoptFile(null)
        return
      }

      const state = result.value
      const changed =
        state.hash !== activeFile.hash ||
        state.size !== activeFile.size ||
        state.mtimeMs !== activeFile.mtimeMs
      if (!changed) return

      if (dirtyRef.current) {
        setExternalConflict(state)
        setNotice({ tone: 'error', text: 'This file changed on disk while you have unsaved changes.' })
        return
      }

      const fresh = await forgeApi.workspace.readFile(activeFile.path)
      if (fresh) adoptFile(fresh)
    } catch {
      return
    }
  }, [activeFile, adoptFile])

  useEffect(() => {
    if (!forgeApi?.workspace) return
    const unsubscribe = forgeApi.workspace.onFileChanged((event: FileChangeEvent) => {
      void loadTree()
      if (activeFile && normalizePath(event.path) === normalizePath(activeFile.path)) {
        void checkActiveFile()
      }
    })
    return () => {
      unsubscribe()
    }
  }, [activeFile, checkActiveFile, loadTree])

  useEffect(() => {
    const onFocus = () => void checkActiveFile()
    const onVisibility = () => {
      if (!document.hidden) void checkActiveFile()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [checkActiveFile])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  const handleOpenFolder = useCallback(async () => {
    if (!forgeApi?.workspace || !confirmDiscard()) return
    try {
      const result = await forgeApi.workspace.openFolder()
      if (result) {
        setWorkspace(result.workspace)
        setTree(result.tree)
        adoptFile(null)
        setView('workspace')
      }
    } catch {
      setNotice({ tone: 'error', text: 'Could not open the selected folder.' })
    }
  }, [adoptFile, confirmDiscard])

  const handleOpenFile = useCallback(async () => {
    if (!forgeApi?.workspace || !confirmDiscard()) return
    try {
      const result = await forgeApi.workspace.openFile()
      if (result) {
        adoptFile(result)
        setView('workspace')
      } else if (!workspace) {
        setNotice({ tone: 'info', text: 'Open a project folder before opening files.' })
      }
    } catch {
      setNotice({ tone: 'error', text: 'Could not open the selected file.' })
    }
  }, [adoptFile, confirmDiscard, workspace])

  const handleSelectFile = useCallback(
    async (node: FileTreeNode) => {
      if (node.type !== 'file' || !forgeApi?.workspace) return
      if (activeFile?.path === node.path && !dirty) return
      if (!confirmDiscard()) return
      await openPath(node.path)
      setView('workspace')
    },
    [activeFile?.path, confirmDiscard, dirty, openPath]
  )

  const handleCloseFile = useCallback(() => {
    if (!confirmDiscard()) return
    adoptFile(null)
  }, [adoptFile, confirmDiscard])

  const handleSaveFile = useCallback(
    async (filePath: string, content: string, options?: { overwrite?: boolean }): Promise<WorkspaceResult<OpenedFile>> => {
        const failure = (text: string, code: 'NO_WORKSPACE' | 'IO_ERROR' = 'NO_WORKSPACE'): WorkspaceResult<OpenedFile> => ({
          ok: false,
          error: { code, message: text },
        })
        if (saveInFlightRef.current) {
          return failure('Save already in progress.', 'IO_ERROR')
        }
        if (!forgeApi?.workspace || !activeFile || activeFile.path !== filePath) {
          return failure('No active file to save.')
        }

        saveInFlightRef.current = true
        setSavePhase('saving')
        setNotice(null)
        try {
          const expected = options?.overwrite
            ? undefined
            : {
                path: activeFile.path,
                size: activeFile.size,
                mtimeMs: activeFile.mtimeMs,
                hash: activeFile.hash,
              }
          const result = await forgeApi.workspace.saveFile(filePath, content, expected)
          if (result.ok) {
            adoptFile(result.value)
            setSavePhase('saved')
            setNotice({ tone: 'success', text: `Saved ${result.value.name} to disk` })
            window.setTimeout(() => setSavePhase('idle'), 2000)
            void loadTree()
          } else {
            setSavePhase('error')
            setNotice({ tone: 'error', text: result.error.message })
            if (result.error.current) setExternalConflict(result.error.current)
          }
          return result
        } catch {
          setSavePhase('error')
          setNotice({ tone: 'error', text: 'Save failed due to an unexpected error.' })
          return failure('Save failed due to an unexpected error.', 'IO_ERROR')
        } finally {
          saveInFlightRef.current = false
        }
    },
    [activeFile, adoptFile, loadTree]
  )

  const handleReloadFile = useCallback(async () => {
    if (!activeFile || !confirmDiscard()) return
    const fresh = await openPath(activeFile.path)
    if (fresh) setNotice({ tone: 'success', text: `Reloaded ${fresh.name} from disk` })
  }, [activeFile, confirmDiscard, openPath])

  const handleCreateEntry = useCallback(
    async (parentPath: string, name: string, type: 'file' | 'directory'): Promise<WorkspaceResult<WorkspaceEntry> | null> => {
      if (!forgeApi?.workspace || !confirmDiscard()) return null
      try {
        const result = await forgeApi.workspace.createEntry(parentPath, name, type)
        if (result.ok) {
          setNotice({ tone: 'success', text: `Created ${name}` })
          await loadTree()
          if (result.value.type === 'file') await openPath(result.value.path)
        } else {
          setNotice({ tone: 'error', text: result.error.message })
        }
        return result
      } catch {
        setNotice({ tone: 'error', text: 'Could not create the file or folder.' })
        return null
      }
    },
    [confirmDiscard, loadTree, openPath]
  )

  const handleRenameEntry = useCallback(
    async (entryPath: string, newName: string): Promise<WorkspaceResult<WorkspaceEntry> | null> => {
      if (!forgeApi?.workspace || !confirmDiscard()) return null
      try {
        const result = await forgeApi.workspace.renameEntry(entryPath, newName)
        if (result.ok) {
          setNotice({ tone: 'success', text: `Renamed to ${newName}` })
          if (activeFile && activeFile.path === entryPath) {
            if (result.value.type === 'file') await openPath(result.value.path)
            else adoptFile(null)
          }
          await loadTree()
        } else {
          setNotice({ tone: 'error', text: result.error.message })
        }
        return result
      } catch {
        setNotice({ tone: 'error', text: 'Could not rename the file or folder.' })
        return null
      }
    },
    [activeFile, adoptFile, confirmDiscard, loadTree, openPath]
  )

  const handleDeleteEntry = useCallback(
    async (entryPath: string) => {
      if (!forgeApi?.workspace || !confirmDiscard()) return
      try {
        const result = await forgeApi.workspace.deleteEntry(entryPath)
        if (!result.ok) {
          setNotice({ tone: 'error', text: result.error.message })
          return
        }
        if (!result.value.deleted) return
        if (activeFile && activeFile.path === entryPath) adoptFile(null)
        setNotice({ tone: 'success', text: 'Deleted from disk' })
        await loadTree()
      } catch {
        setNotice({ tone: 'error', text: 'Could not delete the file or folder.' })
      }
    },
    [activeFile, adoptFile, confirmDiscard, loadTree]
  )

  const handleSwitchWorkspace = useCallback(
    async (targetPath: string) => {
      if (!forgeApi?.workspace || !confirmDiscard()) return
      try {
        const updated = await forgeApi.workspace.setCurrent(targetPath)
        if (updated) {
          setWorkspace(updated)
          await loadTree(targetPath)
          adoptFile(null)
          setView('workspace')
        } else {
          setNotice({ tone: 'error', text: 'Could not switch to that folder.' })
        }
      } catch {
        setNotice({ tone: 'error', text: 'Could not switch to that folder.' })
      }
    },
    [adoptFile, confirmDiscard, loadTree]
  )

  useEffect(() => {
    if (!forgeApi?.workspace) return
    const unsubFolder = forgeApi.workspace.onMenuOpenFolder(() => {
      void handleOpenFolder()
    })
    const unsubFile = forgeApi.workspace.onMenuOpenFile(() => {
      void handleOpenFile()
    })
    const unsubSave = forgeApi.workspace.onMenuSaveFile(() => {
      if (activeFile) void handleSaveFile(activeFile.path, draftContent)
    })
    return () => {
      unsubFolder()
      unsubFile()
      unsubSave()
    }
  }, [activeFile, draftContent, handleOpenFile, handleOpenFolder, handleSaveFile])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (activeFile) void handleSaveFile(activeFile.path, draftContent)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeFile, draftContent, handleSaveFile])

  const startNewSession = () => {
    setSessionKey((key) => key + 1)
    setView('chat')
  }

  return (
    <div className="shell">
      <TitleBar
        sidebarOpen={sidebarOpen}
        workspace={workspace}
        activeFileName={activeFile ? `${dirty ? '* ' : ''}${activeFile.name}` : null}
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
            onCreateEntry={handleCreateEntry}
            onRenameEntry={handleRenameEntry}
            onDeleteEntry={handleDeleteEntry}
          />
        ) : null}
        <main className="view-host">
          {notice ? (
            <button type="button" className={`workspace-notice ${notice.tone}`} onClick={() => setNotice(null)}>
              {notice.text}
            </button>
          ) : null}
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
              content={draftContent}
              isDirty={dirty}
              savePhase={savePhase}
              externalConflict={externalConflict}
              loading={loadingTree}
              onOpenFolder={handleOpenFolder}
              onOpenFile={handleOpenFile}
              onSelectFile={handleSelectFile}
              onCloseFile={handleCloseFile}
              onContentChange={setDraftContent}
              onSaveFile={handleSaveFile}
              onReloadFile={handleReloadFile}
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
        isDirty={dirty}
        onOpenFolder={handleOpenFolder}
      />
    </div>
  )
}
