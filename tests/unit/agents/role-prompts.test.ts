import { describe, expect, it } from 'vitest'
import { RoleProfileSchema } from '../../../src/shared/domain'
import { buildSystemInstructions, resolveRoleProfile } from '../../../electron/agents/agent-prompts/roles'

describe('role profiles', () => {
  it('resolves built-in roles with scoped tools and writable ownership', () => {
    const profile = resolveRoleProfile('frontend')

    expect(profile.role).toBe('frontend')
    expect(profile.allowedTools).toContain('edit_file')
    expect(profile.filesystemPermissions.writableOwnership).toContain('src/**')
    expect(RoleProfileSchema.safeParse(profile).success).toBe(true)
  })

  it('rejects unknown roles without a validated dynamic profile', () => {
    expect(() => resolveRoleProfile('wizard')).toThrowError(/Unknown agent role/)
  })

  it('accepts a dynamic profile but rejects invalid tools', () => {
    const base = resolveRoleProfile('research')
    const { role: _role, ...dynamic } = base
    void _role

    expect(resolveRoleProfile('auditor', dynamic).role).toBe('auditor')
    expect(() => resolveRoleProfile('auditor', { ...dynamic, allowedTools: ['teleport'] })).toThrow()
  })

  it('builds system instructions that treat tool output as untrusted data', () => {
    const profile = resolveRoleProfile('architect')
    const instructions = buildSystemInstructions(profile, 'Audit the IPC surface', 'Read src/shared/ipc.ts')

    expect(instructions).toContain('Audit the IPC surface')
    expect(instructions).toContain('Read src/shared/ipc.ts')
    expect(instructions).toContain('untrusted data')
  })
})
