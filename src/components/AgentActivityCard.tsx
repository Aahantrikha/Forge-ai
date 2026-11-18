import { useState } from 'react'
import type { AgentToolActivity } from '../shared/agent'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  ShieldIcon,
  SparkIcon,
  TerminalIcon,
  WrenchIcon,
} from './icons'

interface AgentActivityCardProps {
  activity: AgentToolActivity
}

export function AgentActivityCard({ activity }: AgentActivityCardProps) {
  const [expanded, setExpanded] = useState(false)

  const getToolIcon = () => {
    switch (activity.toolType) {
      case 'read_file':
        return <FileIcon size={14} />
      case 'search_codebase':
        return <SparkIcon size={14} />
      case 'run_command':
        return <TerminalIcon size={14} />
      case 'edit_file':
      case 'create_file':
        return <WrenchIcon size={14} />
      case 'run_tests':
        return <ShieldIcon size={14} />
      default:
        return <WrenchIcon size={14} />
    }
  }

  const hasDetails = Boolean(activity.detail || activity.error)

  return (
    <div className={`agent-activity-item ${activity.status}`}>
      <div
        className={`agent-activity-header${hasDetails ? ' clickable' : ''}`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <span className="activity-icon-wrap">{getToolIcon()}</span>
        <span className="activity-title">{activity.title}</span>
        <span className={`activity-status-badge ${activity.status}`}>
          {activity.status === 'running' && <span className="activity-spinner" />}
          {activity.status}
        </span>
        {hasDetails && (
          <span className="activity-chevron">
            {expanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
          </span>
        )}
      </div>
      {expanded && hasDetails && (
        <div className="activity-details">
          {activity.detail && (
            <pre className="activity-code">
              <code>{activity.detail}</code>
            </pre>
          )}
          {activity.error && (
            <div className="activity-error">
              <span>{activity.error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
