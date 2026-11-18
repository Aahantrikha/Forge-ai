import path from 'node:path'
import { createRequire } from 'node:module'
import Database from 'better-sqlite3'

const require = createRequire(import.meta.url)
const sqliteRoot = path.dirname(require.resolve('better-sqlite3/package.json'))
const electronBinding = path.join(sqliteRoot, 'build', 'Electron', 'better_sqlite3.node')

export function createSqliteDatabase(filePath: string): Database.Database {
  const options = process.versions.electron ? { nativeBinding: electronBinding } : undefined
  return new Database(filePath, options)
}
