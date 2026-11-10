import { useState } from 'react'
import { ActivityRail } from './components/ActivityRail'
import { Sidebar } from './components/Sidebar'
import { StatusBar } from './components/StatusBar'
import { TitleBar } from './components/TitleBar'
import type { AgentId } from './app/agents'
import type { ViewId } from './app/navigation'
import { ChatView } from './views/ChatView'
import { HistoryView } from './views/HistoryView'
import { SettingsView } from './views/SettingsView'
import { WorkspaceView } from './views/WorkspaceView'

/**
 * App shell (Milestone 1): title bar → [activity rail | sidebar | view] →
 * status bar. View routing is plain state — no router dependency needed yet.
 */
export default function App() {
  const [view, setView] = useState<ViewId>('chat')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<AgentId | null>(null)
  // Remount key resets the chat draft/notice when starting a new session.
  const [sessionKey, setSessionKey] = useState(0)

  const startNewSession = () => {
    setSessionKey((key) => key + 1)
    setView('chat')
  }

  return (
    <div className="shell">
      <TitleBar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((open) => !open)} />
      <div className={`shell-body${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
        <ActivityRail activeView={view} onSelect={setView} onNewChat={startNewSession} />
        {sidebarOpen ? <Sidebar view={view} onNewChat={startNewSession} /> : null}
        <main className="view-host">
          {view === 'chat' ? (
            <ChatView key={sessionKey} selectedAgent={selectedAgent} onSelectAgent={setSelectedAgent} />
          ) : null}
          {view === 'workspace' ? <WorkspaceView /> : null}
          {view === 'history' ? <HistoryView /> : null}
          {view === 'settings' ? <SettingsView /> : null}
        </main>
      </div>
      <StatusBar selectedAgent={selectedAgent} />
    </div>
  )
}
