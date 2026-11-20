import path from 'node:path'
import type { Agent, ToolName } from '../../src/shared/domain'
import { ForgeErrorImpl } from '../../src/shared/errors'
import { PathGuard, PathGuardError } from './path-guard'

export type ToolPermission = 'read_only' | 'controlled' | 'sensitive'

export const DEFAULT_TOOL_PERMISSIONS: Record<ToolName, ToolPermission> = {
  read_file: 'read_only',
  search_codebase: 'read_only',
  list_directory: 'read_only',
  inspect_git: 'read_only',
  edit_file: 'controlled',
  write_file: 'controlled',
  create_artifact: 'controlled',
  execute_command: 'sensitive',
  run_tests: 'sensitive',
  create_worktree: 'sensitive',
  request_approval: 'sensitive',
}

function globToRegExp(glob: string): RegExp {
  const normalized = glob.replace(/\\/g, '/').replace(/^\.\//, '')
  let pattern = ''
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]
    if (char === '*') {
      if (normalized[index + 1] === '*') {
        pattern += '.*'
        index += 1
      } else {
        pattern += '[^/]*'
      }
    } else if (char === '?') {
      pattern += '[^/]'
    } else {
      pattern += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${pattern}$`)
}

function matchesOwnership(pattern: string, relativePath: string): boolean {
  return globToRegExp(pattern).test(relativePath)
}

export class ToolRegistry {
  constructor(private readonly permissions: Record<ToolName, ToolPermission> = DEFAULT_TOOL_PERMISSIONS) {}

  assertAllowed(agent: Agent, tool: ToolName): void {
    if (!agent.availableTools.includes(tool)) {
      throw new ForgeErrorImpl('PERMISSION_DENIED', `Agent role "${agent.role}" cannot use tool "${tool}".`, {
        agentId: agent.id,
        tool,
      })
    }
  }

  authorize(agent: Agent, tool: ToolName, targetPath?: string): string | null {
    this.assertAllowed(agent, tool)
    const permission = this.permissions[tool]

    if (permission === 'sensitive') {
      throw new ForgeErrorImpl('APPROVAL_REQUIRED', `Tool "${tool}" requires explicit approval.`, {
        agentId: agent.id,
        tool,
      })
    }

    if (!targetPath) {
      if (permission === 'controlled') {
        throw new ForgeErrorImpl('INVALID_ARGUMENT', `Tool "${tool}" requires a target path.`, { tool })
      }
      return null
    }

    const root = agent.filesystemPermissions.roots[0] ?? agent.workingDirectory
    let guard: PathGuard
    let resolved: string
    try {
      guard = new PathGuard(root)
      resolved = guard.resolve(targetPath)
    } catch (error) {
      if (error instanceof PathGuardError) {
        throw new ForgeErrorImpl('PERMISSION_DENIED', error.message, {
          agentId: agent.id,
          tool,
          path: error.details.path,
        })
      }
      throw error
    }

    if (permission === 'controlled') {
      const relative = path.relative(guard.getRoot(), resolved).replace(/\\/g, '/')
      const owned = agent.filesystemPermissions.writableOwnership.some((pattern) => matchesOwnership(pattern, relative))
      if (!owned) {
        throw new ForgeErrorImpl('PERMISSION_DENIED', `Agent does not own "${relative}".`, {
          agentId: agent.id,
          tool,
          path: resolved,
        })
      }
    }

    return resolved
  }
}
