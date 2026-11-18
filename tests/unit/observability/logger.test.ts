import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { redact, StructuredLogger } from '../../../electron/observability/logger'

const dirs: string[] = []

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop()!
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

function tempLogFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-log-'))
  dirs.push(dir)
  return path.join(dir, 'forge.log')
}

describe('redact', () => {
  it('redacts provider keys and bearer tokens in strings', () => {
    expect(redact('key sk-abcdefgh1234')).toBe('key ***REDACTED***')
    expect(redact('Authorization: Bearer abcdefgh1234')).toContain('***REDACTED***')
  })

  it('redacts named secret fields recursively', () => {
    const result = redact({ apiKey: 'sk-abcdefgh1234', nested: { password: 'hunter22' }, safe: 1 })
    expect(result).toEqual({ apiKey: '***REDACTED***', nested: { password: '***REDACTED***' }, safe: 1 })
  })
})

describe('StructuredLogger', () => {
  it('writes newline-delimited JSON with redacted fields', () => {
    const file = tempLogFile()
    const logger = new StructuredLogger(file)
    logger.info('workflow:started', { workflowId: 'wf-1', apiKey: 'sk-abcdefgh1234' })
    logger.error('command:failed', { exitCode: 1 })

    const lines = fs.readFileSync(file, 'utf-8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ event: 'workflow:started', level: 'info', workflowId: 'wf-1', apiKey: '***REDACTED***' })
    expect(lines[1]).toMatchObject({ event: 'command:failed', level: 'error', exitCode: 1 })
    expect(typeof lines[0]?.timestamp).toBe('string')
  })
})
