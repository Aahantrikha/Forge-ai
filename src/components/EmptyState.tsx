import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  body: string
  /** Honest placement note, e.g. which milestone delivers this. */
  hint?: string
  compact?: boolean
}

/**
 * Shared empty-state panel. Used everywhere a feature is not implemented yet:
 * the copy must always say so truthfully instead of faking content (§5).
 */
export function EmptyState({ icon, title, body, hint, compact = false }: EmptyStateProps) {
  return (
    <div className={`empty-state${compact ? ' compact' : ''}`}>
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {hint ? <p className="empty-hint">{hint}</p> : null}
    </div>
  )
}
