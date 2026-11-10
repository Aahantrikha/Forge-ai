import type { ButtonHTMLAttributes, ComponentType, ReactNode } from 'react'
import { VIEW_META, type ViewId } from '../app/navigation'
import { ChatIcon, FolderIcon, HistoryIcon, PlusIcon, SettingsIcon } from './icons'
import type { IconProps } from './icons'

type IconComponent = ComponentType<IconProps>

/** Rail order: chat first, settings pinned last. */
const RAIL_ITEMS: { id: ViewId; Icon: IconComponent }[] = [
  { id: 'chat', Icon: ChatIcon },
  { id: 'workspace', Icon: FolderIcon },
  { id: 'history', Icon: HistoryIcon },
]

interface ActivityRailProps {
  activeView: ViewId
  onSelect: (view: ViewId) => void
  /** Global "new chat" action from the rail. */
  onNewChat: () => void
}

/** Vertical navigation rail for the app shell. */
export function ActivityRail({ activeView, onSelect, onNewChat }: ActivityRailProps) {
  return (
    <nav className="activity-rail" aria-label="Primary">
      <button type="button" className="rail-item" onClick={onNewChat} title="New chat" aria-label="New chat">
        <PlusIcon size={19} />
      </button>
      <div className="rail-separator" role="presentation" />
      {RAIL_ITEMS.map(({ id, Icon }) => (
        <RailButton
          key={id}
          active={activeView === id}
          label={VIEW_META[id].label}
          onClick={() => onSelect(id)}
        >
          <Icon size={19} />
        </RailButton>
      ))}
      <div className="rail-spacer" />
      <RailButton
        active={activeView === 'settings'}
        label={VIEW_META.settings.label}
        onClick={() => onSelect('settings')}
      >
        <SettingsIcon size={19} />
      </RailButton>
    </nav>
  )
}

type RailButtonProps = {
  active: boolean
  label: string
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>

function RailButton({ active, label, children, ...rest }: RailButtonProps) {
  return (
    <button
      type="button"
      className={`rail-item${active ? ' active' : ''}`}
      title={label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      {...rest}
    >
      {children}
    </button>
  )
}
