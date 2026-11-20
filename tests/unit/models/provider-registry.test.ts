import { describe, expect, it } from 'vitest'
import type { ProviderAdapter } from '../../../electron/models/provider-adapter'
import { ProviderRegistry } from '../../../electron/models/provider-registry'
import { FakeProviderAdapter } from './fake-provider'

function adapter(id: string): ProviderAdapter {
  return new FakeProviderAdapter(id, () => undefined)
}

describe('ProviderRegistry', () => {
  it('registers and resolves adapters by provider id', () => {
    const registry = new ProviderRegistry()
    registry.register(adapter('alpha'))

    expect(registry.get('alpha').id).toBe('alpha')
    expect(registry.list()).toEqual(['alpha'])
  })

  it('rejects duplicate registrations and unknown providers', () => {
    const registry = new ProviderRegistry()
    registry.register(adapter('alpha'))

    expect(() => registry.register(adapter('alpha'))).toThrowError(expect.objectContaining({ code: 'CONFLICT' }))
    expect(() => registry.get('missing')).toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }))
  })

  it('creates factory-backed adapters on demand', () => {
    const registry = new ProviderRegistry()
    registry.registerFactory('factory', (onEvent) => new FakeProviderAdapter('factory', onEvent))

    const created = registry.get('factory')
    expect(created.id).toBe('factory')
    expect(registry.get('factory')).toBe(created)
  })
})
