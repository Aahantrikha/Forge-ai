import {
  AgentMessageSchema,
  newId,
  type AgentMessage,
  type CreateMessageInput,
} from '../../../src/shared/domain'
import type { ForgeDatabase } from '../database'

interface MessageRow {
  id: string
  workflow_id: string
  sender_id: string
  receiver_id: string | null
  type: string
  task_id: string | null
  content: string
  correlation_id: string | null
  created_at: number
}

function map(row: MessageRow): AgentMessage {
  return AgentMessageSchema.parse({
    id: row.id,
    workflowId: row.workflow_id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    type: row.type,
    taskId: row.task_id,
    content: row.content,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
  })
}

export class MessageRepository {
  constructor(private readonly store: ForgeDatabase) {}

  create(input: CreateMessageInput): AgentMessage {
    const id = input.id ?? newId()
    const createdAt = Date.now()
    this.store.db
      .prepare(`
        INSERT OR IGNORE INTO agent_messages (
          id, workflow_id, sender_id, receiver_id, type, task_id, content, correlation_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.workflowId,
        input.senderId,
        input.receiverId ?? null,
        input.type,
        input.taskId ?? null,
        input.content,
        input.correlationId ?? null,
        createdAt
      )
    return this.getById(id)!
  }

  getById(id: string): AgentMessage | null {
    const row = this.store.db.prepare('SELECT * FROM agent_messages WHERE id = ?').get(id) as MessageRow | undefined
    return row ? map(row) : null
  }

  listByWorkflow(workflowId: string): AgentMessage[] {
    return (
      this.store.db
        .prepare('SELECT * FROM agent_messages WHERE workflow_id = ? ORDER BY created_at ASC')
        .all(workflowId) as MessageRow[]
    ).map(map)
  }

  listByReceiver(receiverId: string, workflowId: string): AgentMessage[] {
    return (
      this.store.db
        .prepare('SELECT * FROM agent_messages WHERE receiver_id = ? AND workflow_id = ? ORDER BY created_at ASC')
        .all(receiverId, workflowId) as MessageRow[]
    ).map(map)
  }
}
