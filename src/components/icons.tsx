import type { ReactNode } from 'react'

export interface IconProps {
  size?: number
  className?: string
}

function Base({ size = 18, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

/* Brand mark — ember gradient tile with the Forge anvil glyph. */
export function ForgeMark({ size = 15, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path d="M12 4 5.5 12h4L5 20h14l-4.5-8h4L12 4z" fill="currentColor" />
    </svg>
  )
}

export const ChatIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Base>
)

export const FolderIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </Base>
)

export const HistoryIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </Base>
)

export const SettingsIcon = (p: IconProps) => (
  <Base {...p}>
    <line x1="4" y1="21" x2="4" y2="14" />
    <line x1="4" y1="10" x2="4" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12" y2="3" />
    <line x1="20" y1="21" x2="20" y2="16" />
    <line x1="20" y1="12" x2="20" y2="3" />
    <line x1="1" y1="14" x2="7" y2="14" />
    <line x1="9" y1="8" x2="15" y2="8" />
    <line x1="17" y1="16" x2="23" y2="16" />
  </Base>
)

export const PlusIcon = (p: IconProps) => (
  <Base {...p}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </Base>
)

export const SendIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M22 2 11 13" />
    <path d="m22 2-7 20-4-9-9-4 20-7z" />
  </Base>
)

export const PaperclipIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </Base>
)

export const ChevronDownIcon = (p: IconProps) => (
  <Base {...p}>
    <polyline points="6 9 12 15 18 9" />
  </Base>
)

export const SidebarToggleIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line x1="9" y1="4" x2="9" y2="20" />
  </Base>
)

export const MinimizeIcon = (p: IconProps) => (
  <Base {...p}>
    <line x1="5" y1="12" x2="19" y2="12" />
  </Base>
)

export const MaximizeIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="5.5" y="5.5" width="13" height="13" rx="1.5" />
  </Base>
)

export const RestoreIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="8" y="3" width="13" height="13" rx="1.5" />
    <path d="M16 16v3.5A1.5 1.5 0 0 1 14.5 21h-9A1.5 1.5 0 0 1 4 19.5v-9A1.5 1.5 0 0 1 5.5 9H9" />
  </Base>
)

export const CloseIcon = (p: IconProps) => (
  <Base {...p}>
    <line x1="5" y1="5" x2="19" y2="19" />
    <line x1="19" y1="5" x2="5" y2="19" />
  </Base>
)

export const ShieldIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </Base>
)

export const DatabaseIcon = (p: IconProps) => (
  <Base {...p}>
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </Base>
)

export const TerminalIcon = (p: IconProps) => (
  <Base {...p}>
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </Base>
)

export const SparkIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8m0-12.8-2.8 2.8m-7.2 7.2-2.8 2.8" />
  </Base>
)
