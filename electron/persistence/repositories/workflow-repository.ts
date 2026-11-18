import {
  WorkflowSchema,
  newId,
  type CreateWorkflowInput,
  type Workflow,
  type WorkflowStatus,
} from '../../../src/shared/domain'
import type { ForgeDatabase } from '../database'
import { now, parseJson, toJson } from './helpers'

interface WorkflowRow {
  id: string
  project_id: string
  objective: string
  status: WorkflowStatus
  plan_artifact_id: string | null
  base_commit: string | null
  base_branch: string | null
  failure_reason: string | null
  metadata: string | null
  created_at: number
  updated_at: number
  started_at: number | null
  completed_at: number | null
}

function map(row: WorkflowRow): Workflow {
  return WorkflowSchema.parse({
    id: row.id,
    projectId: row.project_id,
    objective: row.objective,
    status: row.status,
    planArtifactId: row.plan_artifact_id,
    baseCommit: row.base_commit,
    baseBranch: row.base_branch,
    failureReason: row.failure_reason,
    metadata: parseJson<Record<string, unknown> | null>(row.metadata, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  })
}

export type WorkflowPatch = Partial<
  Pick<
    Workflow,
    'status' | 'planArtifactId' | 'baseCommit' | 'baseBranch' | 'failureReason' | 'metadata' | 'startedAt' | 'completedAt'
  >
>

export class WorkflowRepository {
  constructor(private readonly store: ForgeDatabase) {}

  getById(id: string): Workflow | null {
    const row = this.store.db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as WorkflowRow | undefined
    return row ? map(row) : null
  }

  listByProject(projectId: string): Workflow[] {
    const rows = this.store.db
      .prepare('SELECT * FROM workflows WHERE project_id = ? ORDER BY created_at DESC')
      .all(projectId) as WorkflowRow[]
    return rows.map(map)
  }

  list(): Workflow[] {
    return (this.store.db.prepare('SELECT * FROM workflows ORDER BY created_at DESC').all() as WorkflowRow[]).map(map)
  }

  create(input: CreateWorkflowInput): Workflow {
    const timestamp = now()
    const id = input.id ?? newId()
    this.store.db
      .prepare(`
        INSERT INTO workflows (
          id, project_id, objective, status, plan_artifact_id, base_commit, base_branch,
          failure_reason, metadata, created_at, updated_at, started_at, completed_at
        ) VALUES (?, ?, ?, 'planning', NULL, ?, ?, NULL, ?, ?, ?, NULL, NULL)
      `)
      .run(
        id,
        input.projectId,
        input.objective,
        input.baseCommit ?? null,
        input.baseBranch ?? null,
        toJson(input.metadata ?? null),
        timestamp,
        timestamp
      )
    return this.getById(id)!
  }

  update(id: string, patch: WorkflowPatch): Workflow | null {
    const columns: Record<keyof WorkflowPatch, string> = {
      status: 'status',
      planArtifactId: 'plan_artifact_id',
      baseCommit: 'base_commit',
      baseBranch: 'base_branch',
      failureReason: 'failure_reason',
      metadata: 'metadata',
      startedAt: 'started_at',
      completedAt: 'completed_at',
    }
    const entries = Object.entries(patch).filter(([, value]) => value !== undefined) as Array<[keyof WorkflowPatch, unknown]>
    if (entries.length === 0) return this.getById(id)
    const assignments = entries.map(([key]) => `${columns[key]} = ?`)
    const values = entries.map(([key, value]) => (key === 'metadata' ? toJson(value) : value))
    this.store.db
      .prepare(`UPDATE workflows SET ${assignments.join(', ')}, updated_at = ? WHERE id = ?`)
      .run(...values, now(), id)
    return this.getById(id)
  }

  delete(id: string): void {
    this.store.db.prepare('DELETE FROM workflows WHERE id = ?').run(id)
  }
}
