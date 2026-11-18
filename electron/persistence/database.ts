import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { MIGRATIONS } from './schema'
import { createSqliteDatabase } from './sqlite'

export class ForgeDatabase {
  readonly db: Database.Database
  readonly filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
    const dir = path.dirname(filePath)
    fs.mkdirSync(dir, { recursive: true })
    this.db = createSqliteDatabase(filePath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('busy_timeout = 5000')
    this.applyMigrations()
  }

  private applyMigrations(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      )
    `)
    const applied = new Set(
      (this.db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map(
        (row) => row.version
      )
    )
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue
      const run = this.db.transaction(() => {
        this.db.exec(migration.sql)
        this.db
          .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
          .run(migration.version, migration.name, Date.now())
      })
      run()
    }
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)()
  }

  close(): void {
    this.db.close()
  }
}
