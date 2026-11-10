import { useEffect, useState } from 'react'
import { forgeApi } from '../shared/bridge'
import {
  CloseIcon,
  ForgeMark,
  MaximizeIcon,
  MinimizeIcon,
  RestoreIcon,
  SidebarToggleIcon,
} from './icons'

interface TitleBarProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

/** Frameless-window title bar: brand, window controls, drag region. */
export function TitleBar({ sidebarOpen, onToggleSidebar }: TitleBarProps) {
  const [maximized, setMaximized] = useState(false)
  const windowApi = forgeApi?.window
  const hasWindowControls = windowApi !== undefined

  useEffect(() => {
    if (!windowApi) return
    let active = true
    void windowApi.isMaximized().then((value) => {
      if (active) setMaximized(value)
    })
    const unsubscribe = windowApi.onMaximizedChanged(setMaximized)
    return () => {
      active = false
      unsubscribe()
    }
  }, [windowApi])

  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <button
          type="button"
          className={`icon-btn${sidebarOpen ? ' is-on' : ''}`}
          onClick={onToggleSidebar}
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <SidebarToggleIcon size={16} />
        </button>
        <span className="brand-mark">
          <ForgeMark size={13} />
        </span>
        <span className="brand-name">Forge AI</span>
        <span className="brand-stage">Milestone 1</span>
      </div>
      <div className="titlebar-drag" />
      <div className="titlebar-actions">
        {hasWindowControls ? (
          <>
            <button type="button" className="titlebar-btn" onClick={windowApi.minimize} title="Minimize" aria-label="Minimize">
              <MinimizeIcon size={15} />
            </button>
            <button
              type="button"
              className="titlebar-btn"
              onClick={windowApi.toggleMaximize}
              title={maximized ? 'Restore' : 'Maximize'}
              aria-label={maximized ? 'Restore' : 'Maximize'}
            >
              {maximized ? <RestoreIcon size={15} /> : <MaximizeIcon size={14} />}
            </button>
            <button type="button" className="titlebar-btn close" onClick={windowApi.close} title="Close" aria-label="Close">
              <CloseIcon size={15} />
            </button>
          </>
        ) : null}
      </div>
    </header>
  )
}
