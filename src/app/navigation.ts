/** Top-level navigation model for the app shell (Milestone 1). */

export type ViewId = 'chat' | 'workspace' | 'history' | 'settings'

export interface ViewMeta {
  id: ViewId
  label: string
  description: string
}

export const VIEW_META: Record<ViewId, ViewMeta> = {
  chat: { id: 'chat', label: 'Chat', description: 'Conversation workspace' },
  workspace: { id: 'workspace', label: 'Workspace', description: 'Projects and files' },
  history: { id: 'history', label: 'History', description: 'Conversation history' },
  settings: { id: 'settings', label: 'Settings', description: 'Configuration' },
}

export const VIEW_ORDER: ViewId[] = ['chat', 'workspace', 'history', 'settings']
