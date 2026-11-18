import { MIGRATIONS } from './migrations/001-initial'

export const TABLES = [
  'projects',
  'workflows',
  'tasks',
  'agents',
  'agent_tasks',
  'agent_messages',
  'artifacts',
  'approvals',
  'events',
  'model_sessions',
  'execution_records',
  'workflow_checkpoints',
] as const

export type TableName = (typeof TABLES)[number]

export { MIGRATIONS }
