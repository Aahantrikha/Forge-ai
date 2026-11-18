import { CheckpointSchema, newId, type Checkpoint } from '../../../src/shared/domain'
import type { ForgeDatabase } from '../database'
import { now, toJson } from './helpers'

interface CheckpointRow {
  id: string
  workflow_id: string
  reason: string
  state_snapshot: string
  base_commit: string | null
  restored_at: number | null
  restore_count: number
  created_at: number
}

function map(row: CheckpointRow): Checkpoint {
  return CheckpointSchema.parse({
    id: row.id,
    workflowId: row.workflow_id,
    reason: row.reason,
    stateSnapshot: JSON.parse(row.state_snapshot) as Record<string, unknown>,
    baseCommit: row.base_commit,
    restoredAt: row.restored_at,
    restoreCount: row.restore_count,
    createdAt: row.created_at,
  })
}

export class CheckpointRepository {
  constructor(private readonly store: ForgeDatabase) {}

  create(workflowId: string, reason: string, stateSnapshot: Record<string, unknown>, baseCommit: string | null): Checkpoint {
    const id = newId()
    this.store.db
      .prepare(`
        INSERT INTO workflow_checkpoints (
          id, workflow_id, reason, state_snapshot, base_commit, restored_at, restore_count, created_at
        ) VALUES (?, ?, ?, ?, ?, NULL, 0, ?)
      `)
      .run(id, workflowId, reason, toJson(stateSnapshot), baseCommit, now())
    return this.getById(id)!
  }

  getById(id: string): Checkpoint | null {
    const row = this.store.db.prepare('SELECT * FROM workflow_checkpoints WHERE id = ?').get(id) as CheckpointRow | undefined
    return row ? map(row) : null
  }

  latest(workflowId: string): Checkpoint | null {
    const row = this.store.db
      .prepare('SELECT * FROM workflow_checkpoints WHERE workflow_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(workflowId) as CheckpointRow | undefined
    return row ? map(row) : null
  }

  listByWorkflow(workflowId: string): Checkpoint[] {
    return (
      this.store.db
        .prepare('SELECT * FROM workflow_checkpoints WHERE workflow_id = ? ORDER BY created_at ASC')
        .all(workflowId) as CheckpointRow[]
    ).map(map)
  }

  markRestored(id: string): void {
    this.store.db
      .prepare('UPDATE workflow_checkpoints SET restored_at = ?, restore_count = restore_count + 1 WHERE id = ?')
      .run(now(), id)
  }
}
