import { ProjectSchema, newId, type Project } from '../../../src/shared/domain'
import type { ForgeDatabase } from '../database'
import { now } from './helpers'

interface ProjectRow {
  id: string
  name: string
  path: string
  repo_remote: string | null
  default_branch: string | null
  last_opened_at: number
  created_at: number
  updated_at: number
}

function map(row: ProjectRow): Project {
  return ProjectSchema.parse({
    id: row.id,
    name: row.name,
    path: row.path,
    repoRemote: row.repo_remote,
    defaultBranch: row.default_branch,
    lastOpenedAt: row.last_opened_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export class ProjectRepository {
  constructor(private readonly store: ForgeDatabase) {}

  getById(id: string): Project | null {
    const row = this.store.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
    return row ? map(row) : null
  }

  getByPath(projectPath: string): Project | null {
    const row = this.store.db.prepare('SELECT * FROM projects WHERE path = ?').get(projectPath) as
      | ProjectRow
      | undefined
    return row ? map(row) : null
  }

  list(): Project[] {
    const rows = this.store.db.prepare('SELECT * FROM projects ORDER BY last_opened_at DESC').all() as ProjectRow[]
    return rows.map(map)
  }

  upsert(input: { id?: string; name: string; path: string; repoRemote?: string | null; defaultBranch?: string | null }): Project {
    const timestamp = now()
    const existing = this.getByPath(input.path)
    const id = input.id ?? existing?.id ?? newId()
    this.store.db
      .prepare(`
        INSERT INTO projects (id, name, path, repo_remote, default_branch, last_opened_at, created_at, updated_at)
        VALUES (@id, @name, @path, @repoRemote, @defaultBranch, @timestamp, @timestamp, @timestamp)
        ON CONFLICT(path) DO UPDATE SET
          name = excluded.name,
          repo_remote = excluded.repo_remote,
          default_branch = excluded.default_branch,
          last_opened_at = excluded.last_opened_at,
          updated_at = excluded.updated_at
      `)
      .run({
        id,
        name: input.name,
        path: input.path,
        repoRemote: input.repoRemote ?? null,
        defaultBranch: input.defaultBranch ?? null,
        timestamp,
      })
    return this.getByPath(input.path) ?? this.getById(id)!
  }

  touch(id: string): void {
    const timestamp = now()
    this.store.db.prepare('UPDATE projects SET last_opened_at = ?, updated_at = ? WHERE id = ?').run(timestamp, timestamp, id)
  }

  delete(id: string): void {
    this.store.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }
}
