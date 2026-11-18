import {
  ArtifactSchema,
  newId,
  type Artifact,
  type CreateArtifactInput,
} from '../../../src/shared/domain'
import type { ForgeDatabase } from '../database'

interface ArtifactRow {
  id: string
  workflow_id: string
  task_id: string | null
  agent_id: string | null
  kind: string
  name: string
  file_path: string
  checksum: string | null
  size_bytes: number
  supersedes: string | null
  created_at: number
}

function map(row: ArtifactRow): Artifact {
  return ArtifactSchema.parse({
    id: row.id,
    workflowId: row.workflow_id,
    taskId: row.task_id,
    agentId: row.agent_id,
    kind: row.kind,
    name: row.name,
    filePath: row.file_path,
    checksum: row.checksum,
    sizeBytes: row.size_bytes,
    supersedes: row.supersedes,
    createdAt: row.created_at,
  })
}

export class ArtifactRepository {
  constructor(private readonly store: ForgeDatabase) {}

  create(input: CreateArtifactInput): Artifact {
    const id = input.id ?? newId()
    this.store.db
      .prepare(`
        INSERT INTO artifacts (
          id, workflow_id, task_id, agent_id, kind, name, file_path, checksum, size_bytes, supersedes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.workflowId,
        input.taskId ?? null,
        input.agentId ?? null,
        input.kind,
        input.name,
        input.filePath,
        input.checksum ?? null,
        input.sizeBytes ?? 0,
        input.supersedes ?? null,
        Date.now()
      )
    return this.getById(id)!
  }

  getById(id: string): Artifact | null {
    const row = this.store.db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as ArtifactRow | undefined
    return row ? map(row) : null
  }

  listByWorkflow(workflowId: string): Artifact[] {
    return (
      this.store.db.prepare('SELECT * FROM artifacts WHERE workflow_id = ? ORDER BY created_at ASC').all(workflowId) as ArtifactRow[]
    ).map(map)
  }

  listByTask(taskId: string): Artifact[] {
    return (this.store.db.prepare('SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at ASC').all(taskId) as ArtifactRow[]).map(
      map
    )
  }
}
