import { describe, expect, it, vi } from 'vitest'
import { TypedEventBus } from '../../../electron/coordination/event-bus'
import { withTempContext } from '../../helpers'

function withBus<T>(fn: (value: { bus: TypedEventBus; workflowId: string; database: import('../../../electron/persistence/database').ForgeDatabase }) => T): T {
  return withTempContext(({ database, repositories }) => {
    const project = repositories.projects.upsert({ name: 'Demo', path: 'C:/repo/demo' })
    const workflow = repositories.workflows.create({ projectId: project.id, objective: 'Test event bus' })
    const bus = new TypedEventBus(repositories.events)
    return fn({ bus, workflowId: workflow.id, database })
  })
}

describe('TypedEventBus', () => {
  it('persists events, assigns sequences, and deduplicates by event id', () => {
    withBus(({ bus, workflowId, database }) => {
      const first = bus.emit({ eventId: 'ev-1', workflowId, type: 'workflow:created', payload: { objective: 'Test' } })
      const second = bus.emit({ eventId: 'ev-2', workflowId, type: 'workflow:updated', payload: { status: 'executing' } })
      const duplicate = bus.emit({ eventId: 'ev-1', workflowId, type: 'workflow:created', payload: { objective: 'Different' } })

      expect(first).toMatchObject({ eventId: 'ev-1', type: 'workflow:created', sequence: 0 })
      expect(second).toMatchObject({ eventId: 'ev-2', sequence: 1 })
      expect(duplicate.payload).toEqual({ objective: 'Test' })
      const count = database.db.prepare('SELECT COUNT(*) AS count FROM events WHERE workflow_id = ?').get(workflowId) as {
        count: number
      }
      expect(count.count).toBe(2)
    })
  })

  it('dispatches to typed and wildcard listeners without letting one consumer break others', () => {
    withBus(({ bus, workflowId }) => {
      const typed = vi.fn()
      const wildcard = vi.fn()
      bus.on('task:created', typed)
      bus.on('*', wildcard)
      bus.on('task:created', () => {
        throw new Error('consumer failed')
      })

      const event = bus.emit({ workflowId, type: 'task:created', payload: { taskId: 'task-1' } })
      expect(typed).toHaveBeenCalledTimes(1)
      expect(wildcard).toHaveBeenCalledTimes(1)
      expect(wildcard).toHaveBeenCalledWith(event)
    })
  })

  it('replays persisted events and tracks delivery counts', () => {
    withBus(({ bus, workflowId, database }) => {
      const event = bus.emit({ workflowId, type: 'agent:created', payload: { role: 'coder' } })
      const replayed: string[] = []
      const delivered = bus.replay(workflowId, (item) => replayed.push(item.eventId))

      expect(delivered).toBe(1)
      expect(replayed).toEqual([event.eventId])
      const row = database.db.prepare('SELECT delivery_count FROM events WHERE id = ?').get(event.eventId) as {
        delivery_count: number
      }
      expect(row.delivery_count).toBe(1)
    })
  })

  it('returns an unsubscribe function', () => {
    withBus(({ bus, workflowId }) => {
      const listener = vi.fn()
      const unsubscribe = bus.on('workflow:completed', listener)
      unsubscribe()
      bus.emit({ workflowId, type: 'workflow:completed', payload: {} })
      expect(listener).not.toHaveBeenCalled()
    })
  })
})
