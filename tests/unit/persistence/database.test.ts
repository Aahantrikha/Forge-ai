import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createForgeContext, disposeForgeContext } from '../../../electron/context'
import { TABLES } from '../../../electron/persistence/schema'
import { withTempContext } from '../../helpers'

describe('SQLite foundation', () => {
  it('creates all domain tables and records the migration', () => {
    withTempContext(({ database }) => {
      const names = (
        database.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>
      ).map((row) => row.name)
      for (const table of TABLES) expect(names).toContain(table)
      const migrations = database.db.prepare('SELECT version, name FROM schema_migrations').all() as Array<{
        version: number
        name: string
      }>
      expect(migrations).toHaveLength(1)
      expect(migrations[0]).toMatchObject({ version: 1, name: 'initial' })
    })
  })

  it('enables foreign keys and rejects orphaned workflows', () => {
    withTempContext(({ database }) => {
      expect(() =>
        database.db
          .prepare("INSERT INTO workflows (id, project_id, objective, status, created_at, updated_at) VALUES ('w', 'missing', 'x', 'planning', 0, 0)")
          .run()
      ).toThrow()
    })
  })

  it('rolls back a failing transaction', () => {
    withTempContext(({ database }) => {
      const project = database.db
        .prepare('INSERT INTO projects (id, name, path, last_opened_at, created_at, updated_at) VALUES (?, ?, ?, 0, 0, 0)')
      expect(() =>
        database.transaction(() => {
          project.run('p1', 'One', 'C:/repo/one')
          database.db.prepare('INSERT INTO projects (id, name, path, last_opened_at, created_at, updated_at) VALUES (?, ?, ?, 0, 0, 0)').run('p2', 'Two', 'C:/repo/one')
        })
      ).toThrow()
      const count = database.db.prepare('SELECT COUNT(*) AS count FROM projects').get() as { count: number }
      expect(count.count).toBe(0)
    })
  })

  it('does not reapply migrations when reopened', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-m1-reopen-'))
    const first = createForgeContext(dir)
    first.repositories.projects.upsert({ name: 'Demo', path: 'C:/repo/demo' })
    disposeForgeContext(first)
    const second = createForgeContext(dir)
    try {
      expect(second.repositories.projects.list()).toHaveLength(1)
      expect(second.database.db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toMatchObject({ count: 1 })
    } finally {
      disposeForgeContext(second)
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
