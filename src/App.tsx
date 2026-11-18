import { useEffect, useState } from 'react'
import { ActivityRail } from './components/ActivityRail'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { TitleBar } from './components/TitleBar'
import type { AgentId } from './app/agents'
import type { ViewId } from './app/navigation'
import type { WorkspaceInfo } from './shared/workspace'
import { forgeApi } from './shared/bridge'
import { ChatView } from './views/ChatView'
import { HistoryView } from './views/HistoryView'
import { SettingsView } from './views/SettingsView'
import { WorkspaceView } from './views/WorkspaceView'

/**
 * App shell: title bar → [activity rail | sidebar | view] → status bar.
 * Milestone 2 adds active workspace state management and directory switching.
 */
export default function App() {
  const [view, setView] = useState<ViewId>('chat')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<AgentId | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null)
  // Remount key resets the chat draft/notice when starting a new session.
  const [sessionKey, setSessionKey] = useState(0)

  // Load existing workspace / last recent project on start
  useEffect(() => {
    if (!forgeApi?.workspace) return
    let active = true
    void forgeApi.workspace
      .getCurrent()
      .then((current) => {
        if (active && current) {
          setWorkspace(current)
        }
      })
      .catch(() => {
        // Ignored in non-electron or initial load
      })
    return () => {
      active = false
    }
  }, [])

  const startNewSession = () => {
    setSessionKey((key) => key + 1)
    setView('chat')
  }

  const handleSelectDirectory = async () => {
    if (!forgeApi?.workspace) return
    try {
      const updated = await forgeApi.workspace.selectDirectory()
      if (updated) {
        setWorkspace(updated)
      }
    } catch {
      // Failed to open directory dialog
    }
  }

  const handleSwitchWorkspace = async (targetPath: string) => {
    if (!forgeApi?.workspace) return
    try {
      const updated = await forgeApi.workspace.setCurrent(targetPath)
      if (updated) {
        setWorkspace(updated)
      }
    } catch {
      // Failed to switch workspace
    }
  }

  return (
    <div className="shell">
      <TitleBar
        sidebarOpen={sidebarOpen}
        workspace={workspace}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
      />
      <div className={`shell-body${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
        <ActivityRail activeView={view} onSelect={setView} onNewChat={startNewSession} />
        {sidebarOpen ? (
          <Sidebar
            view={view}
            workspace={workspace}
            onNewChat={startNewSession}
            onSelectDirectory={handleSelectDirectory}
            onSwitchWorkspace={handleSwitchWorkspace}
          />
        ) : null}
        <main className="view-host">
          {view === 'chat' ? (
            <ChatView key={sessionKey} selectedAgent={selectedAgent} onSelectAgent={setSelectedAgent} />
          ) : null}
          {view === 'workspace' ? (
            <WorkspaceView
              workspace={workspace}
              onSelectDirectory={handleSelectDirectory}
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
        onOpenWorkspace={() => setView('workspace')}
      />
    </div>
  )
}
