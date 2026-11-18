const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')
const sqliteRoot = path.join(root, 'node_modules', 'better-sqlite3')
const releaseBinary = path.join(sqliteRoot, 'build', 'Release', 'better_sqlite3.node')
const fallbackDir = path.join(sqliteRoot, 'build', 'NodeFallback')
const fallbackBinary = path.join(fallbackDir, 'better_sqlite3.node')
const electronDir = path.join(sqliteRoot, 'build', 'Electron')
const electronBinary = path.join(electronDir, 'better_sqlite3.node')
const rebuildCli = path.join(root, 'node_modules', '@electron', 'rebuild', 'lib', 'cli.js')

if (!fs.existsSync(releaseBinary)) {
  console.error(`Missing Node native binary: ${releaseBinary}`)
  process.exit(1)
}

const restore = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['rebuild', 'better-sqlite3'], {
  cwd: root,
  stdio: 'inherit',
})

if (restore.status !== 0) {
  process.exit(restore.status ?? 1)
}

fs.mkdirSync(fallbackDir, { recursive: true })
fs.copyFileSync(releaseBinary, fallbackBinary)

const result = spawnSync(process.execPath, [rebuildCli, '-f', '-w', 'better-sqlite3'], {
  cwd: root,
  stdio: 'inherit',
})

if (result.status !== 0) {
  fs.copyFileSync(fallbackBinary, releaseBinary)
  process.exit(result.status ?? 1)
}

fs.mkdirSync(electronDir, { recursive: true })
fs.copyFileSync(releaseBinary, electronBinary)
fs.copyFileSync(fallbackBinary, releaseBinary)
