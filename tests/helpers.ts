import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createForgeContext, disposeForgeContext, type ForgeContext } from '../electron/context'

export function withTempContext<T>(fn: (context: ForgeContext, dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-m1-'))
  const context = createForgeContext(dir)
  try {
    return fn(context, dir)
  } finally {
    disposeForgeContext(context)
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

export const sampleProject = { name: 'Demo', path: 'C:/repo/demo' }
