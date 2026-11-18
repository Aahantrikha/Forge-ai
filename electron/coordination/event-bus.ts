import type { EventType, EventDraft, ForgeEvent } from '../../src/shared/domain'
import type { EventRepository } from '../persistence/repositories'

export type EventListener = (event: ForgeEvent) => void

export class TypedEventBus {
  private readonly listeners = new Map<string, Set<EventListener>>()

  constructor(private readonly events: EventRepository) {}

  emit(draft: EventDraft): ForgeEvent {
    const event = this.events.append(draft)
    this.dispatch(event)
    return event
  }

  on(type: EventType | '*', listener: EventListener): () => void {
    const set = this.listeners.get(type) ?? new Set<EventListener>()
    set.add(listener)
    this.listeners.set(type, set)
    return () => {
      set.delete(listener)
      if (set.size === 0) this.listeners.delete(type)
    }
  }

  dispatch(event: ForgeEvent): void {
    const targets: EventListener[] = [
      ...(this.listeners.get(event.type) ?? []),
      ...(this.listeners.get('*') ?? []),
    ]
    for (const listener of targets) {
      this.events.incrementDelivery(event.eventId)
      try {
        listener(event)
      } catch {
        // A consumer failure must not prevent other consumers or the producer.
      }
    }
  }

  replay(workflowId: string, listener: EventListener): number {
    const stored = this.events.listByWorkflow(workflowId)
    for (const event of stored) {
      this.events.incrementDelivery(event.eventId)
      listener(event)
    }
    return stored.length
  }
}
