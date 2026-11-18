import {
  TaskSchema,
  newId,
  type CreateTaskInput,
  type Task,
  type TaskStatus,
} from '../../../src/shared/domain'
import type { ForgeDatabase } from '../database'
import { now, parseJson, toJson } from './helpers'

interface TaskRow {
  id: string
  workflow_id: string
  parent_task_id: string | null
  objective: string
  description: string
  task_type: string
  status: TaskStatus
  dependencies: string
  expected_output: string
  acceptance_criteria: string
  file_ownership: string
  assigned_agent_id: string | null
  priority: number
  max_attempts: number
  attempt_count: number
  execution_limits: string
  result_summary: string | null
  created_at: number
  updated_at: number
  started_at: number | null
  completed_at: number | null
}

function map(row: TaskRow): Task {
  return TaskSchema.parse({
    id: row.id,
    workflowId: row.workflow_id,
    parentTaskId: row.parent_task_id,
    objective: row.objective,
    description: row.description,
    taskType: row.task_type,
    status: row.status,
    dependencies: parseJson<string[]>(row.dependencies, []),
    expectedOutput: row.expected_output,
    acceptanceCriteria: parseJson<string[]>(row.acceptance_criteria, []),
    fileOwnership: parseJson<string[]>(row.file_ownership, []),
    assignedAgentId: row.assigned_agent_id,
    priority: row.priority,
    maxAttempts: row.max_attempts,
    attemptCount: row.attempt_count,
    executionLimits: parseJson(row.execution_limits, {}),
    resultSummary: row.result_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  })
}

export type TaskPatch = Partial<
  Pick<
    Task,
    | 'status'
    | 'assignedAgentId'
    | 'resultSummary'
    | 'attemptCount'
    | 'startedAt'
    | 'completedAt'
    | 'acceptanceCriteria'
    | 'fileOwnership'
  >
>

export class TaskRepository {
  constructor(private readonly store: ForgeDatabase) {}

  getById(id: string): Task | null {
    const row = this.store.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined
    return row ? map(row) : null
  }

  listByWorkflow(workflowId: string): Task[] {
    return (
      this.store.db.prepare('SELECT * FROM tasks WHERE workflow_id = ? ORDER BY priority DESC, created_at ASC').all(workflowId) as TaskRow[]
    ).map(map)
  }

  create(input: CreateTaskInput): Task {
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
        INSERT INTO tasks (
          id, workflow_id, parent_task_id, objective, description, task_type, status,
          dependencies, expected_output, acceptance_criteria, file_ownership,
          assigned_agent_id, priority, max_attempts, attempt_count, execution_limits,
          result_summary, created_at, updated_at, started_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, NULL, ?, ?, 0, ?, NULL, ?, ?, NULL, NULL)
      `)
      .run(
        id,
        input.workflowId,
        input.parentTaskId ?? null,
        input.objective,
        input.description ?? '',
        input.taskType,
        toJson(input.dependencies ?? []),
        input.expectedOutput ?? '',
        toJson(input.acceptanceCriteria ?? []),
        toJson(input.fileOwnership ?? []),
        input.priority ?? 0,
        input.maxAttempts ?? 3,
        toJson(limits),
        timestamp,
        timestamp
      )
    return this.getById(id)!
  }

  update(id: string, patch: TaskPatch): Task | null {
    const columns: Record<keyof TaskPatch, string> = {
      status: 'status',
      assignedAgentId: 'assigned_agent_id',
      resultSummary: 'result_summary',
      attemptCount: 'attempt_count',
      startedAt: 'started_at',
      completedAt: 'completed_at',
      acceptanceCriteria: 'acceptance_criteria',
      fileOwnership: 'file_ownership',
    }
    const entries = Object.entries(patch).filter(([, value]) => value !== undefined) as Array<[keyof TaskPatch, unknown]>
    if (entries.length === 0) return this.getById(id)
    const assignments = entries.map(([key]) => `${columns[key]} = ?`)
    const values = entries.map(([key, value]) =>
      key === 'acceptanceCriteria' || key === 'fileOwnership' ? toJson(value) : value
    )
    this.store.db.prepare(`UPDATE tasks SET ${assignments.join(', ')}, updated_at = ? WHERE id = ?`).run(...values, now(), id)
    return this.getById(id)
  }

  delete(id: string): void {
    this.store.db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  }
}
