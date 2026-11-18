import { newId, type AgentTaskStatus } from '../../../src/shared/domain'
import type { ForgeDatabase } from '../database'
import { now } from './helpers'

export interface AgentTask {
  id: string
  agentId: string
  taskId: string
  attempt: number
  status: AgentTaskStatus
  assignedAt: number
  startedAt: number | null
  completedAt: number | null
}

interface AgentTaskRow {
  id: string
  agent_id: string
  task_id: string
  attempt: number
  status: AgentTaskStatus
  assigned_at: number
  started_at: number | null
  completed_at: number | null
}

function map(row: AgentTaskRow): AgentTask {
  return {
    id: row.id,
    agentId: row.agent_id,
    taskId: row.task_id,
    attempt: row.attempt,
    status: row.status,
    assignedAt: row.assigned_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }
}

export class AgentTaskRepository {
  constructor(private readonly store: ForgeDatabase) {}

  assign(agentId: string, taskId: string, attempt: number): AgentTask {
    const id = newId()
    this.store.db
      .prepare(`
        INSERT INTO agent_tasks (id, agent_id, task_id, attempt, status, assigned_at)
        VALUES (?, ?, ?, ?, 'assigned', ?)
      `)
      .run(id, agentId, taskId, attempt, now())
    return this.getById(id)!
  }

  getById(id: string): AgentTask | null {
    const row = this.store.db.prepare('SELECT * FROM agent_tasks WHERE id = ?').get(id) as AgentTaskRow | undefined
    return row ? map(row) : null
  }

  listByTask(taskId: string): AgentTask[] {
    return (
      this.store.db.prepare('SELECT * FROM agent_tasks WHERE task_id = ? ORDER BY attempt ASC').all(taskId) as AgentTaskRow[]
    ).map(map)
  }

  listByAgent(agentId: string): AgentTask[] {
    return (
      this.store.db.prepare('SELECT * FROM agent_tasks WHERE agent_id = ? ORDER BY assigned_at ASC').all(agentId) as AgentTaskRow[]
    ).map(map)
  }

  setStatus(id: string, status: AgentTaskStatus): void {
    const timestamp = now()
    if (status === 'running') {
      this.store.db.prepare('UPDATE agent_tasks SET status = ?, started_at = ? WHERE id = ?').run(status, timestamp, id)
    } else if (status === 'completed' || status === 'failed' || status === 'released') {
      this.store.db.prepare('UPDATE agent_tasks SET status = ?, completed_at = ? WHERE id = ?').run(status, timestamp, id)
    } else {
      this.store.db.prepare('UPDATE agent_tasks SET status = ? WHERE id = ?').run(status, id)
    }
  }
}
