import { ForgeErrorImpl } from '../../src/shared/errors'
import type { ProviderId } from '../../src/shared/agent'
import type { ProviderAdapter, ProviderAdapterFactory, ProviderEventSink } from './provider-adapter'

export class ProviderRegistry {
  private readonly factories = new Map<ProviderId, ProviderAdapterFactory>()
  private readonly adapters = new Map<ProviderId, ProviderAdapter>()

  register(adapter: ProviderAdapter): void {
    this.assertAvailable(adapter.id)
    this.adapters.set(adapter.id, adapter)
  }

  registerFactory(id: ProviderId, factory: ProviderAdapterFactory): void {
    this.assertAvailable(id)
    this.factories.set(id, factory)
  }

  get(id: ProviderId, onEvent?: ProviderEventSink): ProviderAdapter {
    const existing = this.adapters.get(id)
    if (existing) return existing

    const factory = this.factories.get(id)
    if (!factory) {
      throw new ForgeErrorImpl('NOT_FOUND', `Provider adapter "${id}" is not registered.`, { providerId: id })
    }

    const created = factory(onEvent ?? (() => undefined))
    this.adapters.set(id, created)
    return created
  }

  list(): ProviderId[] {
    return [...new Set([...this.adapters.keys(), ...this.factories.keys()])]
  }

  async dispose(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      try {
        await adapter.dispose()
      } catch {
        this.adapters.delete(adapter.id)
      }
    }
    this.adapters.clear()
    this.factories.clear()
  }

  private assertAvailable(id: ProviderId): void {
    if (this.adapters.has(id) || this.factories.has(id)) {
      throw new ForgeErrorImpl('CONFLICT', `Provider adapter "${id}" is already registered.`, { providerId: id })
    }
  }
}
