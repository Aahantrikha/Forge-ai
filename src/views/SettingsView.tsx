import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AGENTS } from '../app/agents'
import { forgeApi } from '../shared/bridge'
import type { AppInfo } from '../shared/ipc'
import { DatabaseIcon, ForgeMark } from '../components/icons'

/**
 * Settings view in Milestone 1 doubles as a security self-report: it shows the
 * values the main process actually configured (context isolation, sandbox,
 * whitelisted IPC channels) rather than static copy — §9 transparency.
 */
export function SettingsView() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [loadState, setLoadState] = useState<'idle' | 'error-not-electron'>('idle')

  useEffect(() => {
    const api = forgeApi?.app
    if (!api) {
      setLoadState('error-not-electron')
      return
    }
    let active = true
    void api
      .getInfo()
      .then((next) => {
        if (active) setInfo(next)
      })
      .catch(() => {
        if (active) setLoadState('error-not-electron')
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <section className="view" aria-label="Settings">
      <header className="view-header">
        <h1 className="view-title">Settings</h1>
        <span className="view-sub">Preferences storage arrives with SQLite in Milestone 8</span>
      </header>
      <div className="view-body">
        <div className="settings-grid">
          <div className="panel">
            <h2 className="settings-section-title">About</h2>
            {loadState === 'error-not-electron' ? (
              <div className="callout callout-neutral">
                Runtime info is unavailable outside Electron. Launch the desktop app (`npm run dev`) to see it.
              </div>
            ) : info ? (
              <>
                <SettingRow
                  name="Forge AI"
                  detail={`Electron ${info.electronVersion} · ${info.platform}${info.isDevelopment ? ' · development' : ''}`}
                  check={<span className="kv-version">v{info.version}</span>}
                />
                <SettingRow
                  name="IPC surface"
                  detail="Whitelisted channels declared in src/shared/ipc.ts"
                  check={<span className="kv-version">{info.security.ipcChannels.length} channels</span>}
                />
              </>
            ) : (
              <div className="callout callout-neutral">Loading runtime info…</div>
            )}
          </div>

          <div className="panel">
            <h2 className="settings-section-title">Security</h2>
            {info ? (
              <>
                <SettingRow
                  name="Context isolation"
                  detail="Renderer globals are isolated from the preload environment"
                  check={<Check good={info.security.contextIsolationEnabled} label={info.security.contextIsolationEnabled ? 'Enabled' : 'Disabled'} />}
                />
                <SettingRow
                  name="Renderer sandbox"
                  detail="Chromium sandbox enforced for the renderer process"
                  check={<Check good={info.security.sandboxEnabled} label={info.security.sandboxEnabled ? 'Enabled' : 'Disabled'} />}
                />
                <SettingRow
                  name="Node integration"
                  detail="The renderer must have no direct Node access"
                  check={<Check good={!info.security.nodeIntegrationEnabled} label={info.security.nodeIntegrationEnabled ? 'Enabled (unsafe)' : 'Disabled'} />}
                />
                <SettingRow
                  name="IPC whitelist"
                  detail={info.security.ipcChannels.join(', ')}
                  check={<Check good label="Enforced" />}
                />
              </>
            ) : (
              <div className="callout callout-neutral">
                Loading security status…
              </div>
            )}
          </div>

          <div className="panel">
            <h2 className="settings-section-title">Agents</h2>
            {AGENTS.map((agent) => (
              <SettingRow
                key={agent.id}
                name={agent.name}
                detail={`${agent.integration} — ${agent.notes}`}
                check={<span className="badge badge-planned">{agent.plannedMilestone}</span>}
              />
            ))}
          </div>

          <div className="panel">
            <h2 className="settings-section-title">Persistence</h2>
            <div className="callout callout-neutral">
              <DatabaseIcon size={14} /> SQLite storage for projects, conversations, messages, agent sessions and
              settings arrives in Milestone 8. No data is stored in this milestone, and no credentials are ever
              hardcoded.
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

interface SettingRowProps {
  name: string
  detail?: string
  check: ReactNode
}

function SettingRow({ name, detail, check }: SettingRowProps) {
  return (
    <div className="setting-row">
      <div className="row-main">
        <div className="row-name">{name}</div>
        {detail ? <div className="row-detail">{detail}</div> : null}
      </div>
      {check}
    </div>
  )
}

function Check({ good, label }: { good: boolean; label: string }) {
  return <span className="row-check good" style={!good ? { color: 'var(--danger)' } : undefined}>{good ? '✓' : '✗'} {label}</span>
}

/** Sidebar for the settings view: static panel index. */
export function SettingsSidebar() {
  return (
    <>
      <div className="sidebar-header">
        <span className="sidebar-title">Configuration</span>
      </div>
      <div className="sidebar-body">
        <div className="sidebar-section">
          <EmptyStateSettings />
        </div>
      </div>
    </>
  )
}

function EmptyStateSettings() {
  return (
    <div className="empty-state compact">
      <div className="empty-icon"><ForgeMark size={26} /></div>
      <h3>Forge AI</h3>
      <p>Local-first, open-source desktop AI coding environment for Windows.</p>
      <p className="empty-hint">Agent, workspace and persistence settings appear in later milestones.</p>
    </div>
  )
}
