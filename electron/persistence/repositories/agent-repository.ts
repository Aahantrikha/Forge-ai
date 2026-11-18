import {
  AgentSchema,
  newId,
  type Agent,
  type AgentStatus,
  type CreateAgentInput,
} from '../../../src/shared/domain'
import type { ForgeDatabase } from '../database'
import { now, parseJson, toJson } from './helpers'

interface AgentRow {
  id: string
  workflow_id: string
  role: string
  system_instructions: string
  model_config: string
  model_session_id: string | null
  assigned_task_id: string | null
  available_tools: string
  filesystem_permissions: string
  working_directory: string
  execution_limits: string
  tokens_used: number
  status: AgentStatus
  heartbeat_at: number | null
  failure_reason: string | null
  created_at: number
  updated_at: number
  completed_at: number | null
}

function map(row: AgentRow): Agent {
  return AgentSchema.parse({
    id: row.id,
    workflowId: row.workflow_id,
    role: row.role,
    systemInstructions: row.system_instructions,
    modelConfig: parseJson(row.model_config, { providerId: 'opencode', modelId: '' }),
    modelSessionId: row.model_session_id,
    assignedTaskId: row.assigned_task_id,
    availableTools: parseJson(row.available_tools, []),
    filesystemPermissions: parseJson(row.filesystem_permissions, { roots: [], writableOwnership: [] }),
    workingDirectory: row.working_directory,
    executionLimits: parseJson(row.execution_limits, {
      timeoutMs: 600_000,
      tokenBudget: 100_000,
      maxRetries: 2,
      maxRecursionDepth: 2,
    }),
    tokensUsed: row.tokens_used,
    status: row.status,
    heartbeatAt: row.heartbeat_at,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  })
}

export type AgentPatch = Partial<
  Pick<Agent, 'status' | 'modelSessionId' | 'assignedTaskId' | 'tokensUsed' | 'heartbeatAt' | 'failureReason' | 'completedAt'>
>

export class AgentRepository {
  constructor(private readonly store: ForgeDatabase) {}

  getById(id: string): Agent | null {
    const row = this.store.db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as AgentRow | undefined
    return row ? map(row) : null
  }

  listByWorkflow(workflowId: string): Agent[] {
    return (this.store.db.prepare('SELECT * FROM agents WHERE workflow_id = ? ORDER BY created_at ASC').all(workflowId) as AgentRow[]).map(
      map
    )
  }

  create(input: CreateAgentInput): Agent {
    const timestamp = now()
    const id = input.id ?? newId()
    const limits = {
      timeoutMs: input.executionLimits?.timeoutMs ?? 600_000,
      tokenBudget: input.executionLimits?.tokenBudget ?? 100_000,
      maxRetries: input.executionLimits?.maxRetries ?? 2,
      maxRecursionDepth: input.executionLimits?.maxRecursionDepth ?? 2,
    }
    this.store.db
      .prepare(`
        INSERT INTO agents (
          id, workflow_id, role, system_instructions, model_config, model_session_id,
          assigned_task_id, available_tools, filesystem_permissions, working_directory,
          execution_limits, tokens_used, status, heartbeat_at, failure_reason,
          created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, 0, 'idle', NULL, NULL, ?, ?, NULL)
      `)
      .run(
        id,
        input.workflowId,
        input.role,
        input.systemInstructions,
        toJson(input.modelConfig),
        toJson(input.availableTools ?? []),
        toJson(input.filesystemPermissions ?? { roots: [], writableOwnership: [] }),
        input.workingDirectory,
        toJson(limits),
        timestamp,
        timestamp
      )
    return this.getById(id)!
  }

  update(id: string, patch: AgentPatch): Agent | null {
    const columns: Record<keyof AgentPatch, string> = {
      status: 'status',
      modelSessionId: 'model_session_id',
      assignedTaskId: 'assigned_task_id',
      tokensUsed: 'tokens_used',
      heartbeatAt: 'heartbeat_at',
      failureReason: 'failure_reason',
      completedAt: 'completed_at',
    }
    const entries = Object.entries(patch).filter(([, value]) => value !== undefined) as Array<[keyof AgentPatch, unknown]>
    if (entries.length === 0) return this.getById(id)
    const assignments = entries.map(([key]) => `${columns[key]} = ?`)
    this.store.db.prepare(`UPDATE agents SET ${assignments.join(', ')}, updated_at = ? WHERE id = ?`).run(...entries.map(([, value]) => value), now(), id)
    return this.getById(id)
  }

  countActive(workflowId: string): number {
    const row = this.store.db
      .prepare(`SELECT COUNT(*) AS count FROM agents WHERE workflow_id = ? AND status IN ('initializing','running','waiting')`)
      .get(workflowId) as { count: number }
    return row.count
  }

  delete(id: string): void {
    this.store.db.prepare('DELETE FROM agents WHERE id = ?').run(id)
  }
}
