import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentSchema, type Agent } from '../../../src/shared/domain'
import type { ForgeErrorCode } from '../../../src/shared/errors'
import { ToolRegistry } from '../../../electron/security/tool-permissions'

const dirs: string[] = []

function setup() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-tools-'))
  const root = path.join(base, 'project')
  fs.mkdirSync(path.join(root, 'src'), { recursive: true })
  fs.writeFileSync(path.join(root, 'src', 'allowed.ts'), 'export {}\n', 'utf-8')
  fs.writeFileSync(path.join(root, 'README.md'), '# Test\n', 'utf-8')
  fs.writeFileSync(path.join(base, 'outside.txt'), 'secret\n', 'utf-8')
  dirs.push(base)
  return { base, root }
}

function makeAgent(root: string): Agent {
  const timestamp = Date.now()
  return AgentSchema.parse({
    id: 'agent-1',
    workflowId: 'wf-1',
    role: 'frontend',
    systemInstructions: 'Test agent',
    modelConfig: { providerId: 'opencode', modelId: 'opencode/big-pickle' },
    modelSessionId: null,
    assignedTaskId: null,
    availableTools: ['read_file', 'edit_file', 'execute_command'],
    filesystemPermissions: { roots: [root], writableOwnership: ['src/**'] },
    workingDirectory: root,
    executionLimits: { timeoutMs: 1000, tokenBudget: 100, maxRetries: 1, maxRecursionDepth: 1 },
    tokensUsed: 0,
    status: 'idle',
    heartbeatAt: null,
    failureReason: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
  })
}

function expectErrorCode(code: ForgeErrorCode, run: () => unknown) {
  try {
    run()
    throw new Error(`Expected ${code}`)
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code)
  }
}

afterEach(() => {
  while (dirs.length > 0) {
    fs.rmSync(dirs.pop()!, { recursive: true, force: true })
  }
})

describe('ToolRegistry', () => {
  const registry = new ToolRegistry()

  it('authorizes read-only tools inside the workspace', () => {
    const { root } = setup()
    const agent = makeAgent(root)
    const file = path.join(root, 'README.md')

    expect(registry.authorize(agent, 'read_file', file)).toBe(fs.realpathSync.native(file))
  })

  it('blocks reads outside the workspace even for read-only tools', () => {
    const { base, root } = setup()
    const agent = makeAgent(root)

    expectErrorCode('PERMISSION_DENIED', () => registry.authorize(agent, 'read_file', path.join(base, 'outside.txt')))
  })

  it('requires writable ownership for controlled tools', () => {
    const { root } = setup()
    const agent = makeAgent(root)
    const owned = path.join(root, 'src', 'allowed.ts')
    const notOwned = path.join(root, 'README.md')

    expect(registry.authorize(agent, 'edit_file', owned)).toBe(fs.realpathSync.native(owned))
    expectErrorCode('PERMISSION_DENIED', () => registry.authorize(agent, 'edit_file', notOwned))
  })

  it('requires approval for sensitive tools and rejects tools outside the role', () => {
    const { root } = setup()
    const agent = makeAgent(root)

    expectErrorCode('APPROVAL_REQUIRED', () => registry.authorize(agent, 'execute_command', root))
    expectErrorCode('PERMISSION_DENIED', () => registry.authorize(agent, 'create_worktree', root))
  })
})
