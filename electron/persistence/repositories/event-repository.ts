import {
  ForgeEventSchema,
  newId,
  type EventDraft,
  type EventType,
  type ForgeEvent,
} from '../../../src/shared/domain'
import type { ForgeDatabase } from '../database'
import { toJson } from './helpers'

interface EventRow {
  id: string
  workflow_id: string | null
  agent_id: string | null
  task_id: string | null
  event_type: string
  payload: string
  correlation_id: string | null
  causation_id: string | null
  sequence: number
  delivery_count: number
  occurred_at: number
  persisted_at: number
}

function map(row: EventRow): ForgeEvent {
  return ForgeEventSchema.parse({
    eventId: row.id,
    workflowId: row.workflow_id,
    agentId: row.agent_id,
    taskId: row.task_id,
    type: row.event_type,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    correlationId: row.correlation_id ?? undefined,
    causationId: row.causation_id ?? undefined,
    sequence: row.sequence,
    occurredAt: row.occurred_at,
  })
}

export class EventRepository {
  constructor(private readonly store: ForgeDatabase) {}

  nextSequence(workflowId: string | null): number {
    if (!workflowId) {
      const row = this.store.db.prepare('SELECT COALESCE(MAX(sequence), -1) + 1 AS next FROM events').get() as { next: number }
      return row.next
    }
    const row = this.store.db
      .prepare('SELECT COALESCE(MAX(sequence), -1) + 1 AS next FROM events WHERE workflow_id = ?')
      .get(workflowId) as { next: number }
    return row.next
  }

  append(draft: EventDraft): ForgeEvent {
    const eventId = draft.eventId ?? newId()
    const workflowId = draft.workflowId ?? null
    const timestamp = Date.now()
    const sequence = this.nextSequence(workflowId)
    this.store.db
      .prepare(`
        INSERT OR IGNORE INTO events (
          id, workflow_id, agent_id, task_id, event_type, payload,
          correlation_id, causation_id, sequence, delivery_count, occurred_at, persisted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `)
      .run(
        eventId,
        workflowId,
        draft.agentId ?? null,
        draft.taskId ?? null,
        draft.type,
        toJson(draft.payload ?? {}),
        draft.correlationId ?? null,
        draft.causationId ?? null,
        sequence,
        draft.occurredAt ?? timestamp,
        timestamp
      )
    return this.getById(eventId)!
  }

  getById(eventId: string): ForgeEvent | null {
    const row = this.store.db.prepare('SELECT * FROM events WHERE id = ?').get(eventId) as EventRow | undefined
    return row ? map(row) : null
  }

  listByWorkflow(workflowId: string): ForgeEvent[] {
    return (
      this.store.db
        .prepare('SELECT * FROM events WHERE workflow_id = ? ORDER BY sequence ASC')
        .all(workflowId) as EventRow[]
    ).map(map)
  }

  listByType(type: EventType, limit = 200): ForgeEvent[] {
    return (
      this.store.db
        .prepare('SELECT * FROM events WHERE event_type = ? ORDER BY occurred_at DESC LIMIT ?')
        .all(type, limit) as EventRow[]
    ).map(map)
  }

  incrementDelivery(eventId: string): void {
    this.store.db.prepare('UPDATE events SET delivery_count = delivery_count + 1 WHERE id = ?').run(eventId)
  }
}
