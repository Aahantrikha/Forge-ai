/**
 * Agent registry.
 *
 * In Milestone 1 this drives UI only: the agent selector, status bar and
 * settings screens. It intentionally reports integrations as *planned* —
 * nothing here claims a working capability before an AgentAdapter exists
 * (spec §2, §5: never fabricate agent activity).
 *
 * From Milestone 3 onward, each entry gains an adapter implementing the
 * provider-independent AgentAdapter interface; `status` becomes derived from
 * real authentication/availability checks instead of this static table.
 */

export type AgentId = 'opencode' | 'codex' | 'gemini'

export type AgentStatus = 'planned' | 'available'

export interface AgentDescriptor {
  id: AgentId
  name: string
  /** How the integration connects (facts, not marketing). */
  integration: string
  status: AgentStatus
  /** Whether the integration can work from an existing subscription. */
  needsApiKey: boolean
  plannedMilestone: 'Milestone 3' | 'Milestone 4' | 'Milestone 5'
  notes: string
}

export const AGENTS: readonly AgentDescriptor[] = [
  {
    id: 'opencode',
    name: 'OpenCode',
    integration: 'OpenCode TypeScript SDK',
    status: 'planned',
    needsApiKey: false,
    plannedMilestone: 'Milestone 3',
    notes: 'Provider auth and model selection via the SDK; free models clearly separated from paid ones.',
  },
  {
    id: 'codex',
    name: 'OpenAI Codex',
    integration: 'Codex App Server protocol',
    status: 'planned',
    needsApiKey: false,
    plannedMilestone: 'Milestone 4',
    notes: 'Existing ChatGPT account authentication where the plan permits; no API keys or separate billing.',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    integration: 'Google Antigravity CLI',
    status: 'planned',
    needsApiKey: false,
    plannedMilestone: 'Milestone 5',
    notes: 'Reuses the already-authenticated Google account; no API keys and no paid cloud projects.',
  },
]

export function getAgent(id: AgentId | null): AgentDescriptor | null {
  if (id === null) return null
  return AGENTS.find((agent) => agent.id === id) ?? null
}
