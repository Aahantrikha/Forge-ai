import { z } from 'zod'
import { MessageIdSchema, TaskIdSchema, TimestampSchema, WorkflowIdSchema } from './ids'

export const MessageTypeSchema = z.enum([
  'question',
  'answer',
  'handoff',
  'blocker',
  'status',
  'artifact',
  'clarification',
])

export type MessageType = z.infer<typeof MessageTypeSchema>

export const AgentMessageSchema = z.object({
  id: MessageIdSchema,
  workflowId: WorkflowIdSchema,
  senderId: z.string().min(1),
  receiverId: z.string().min(1).nullable(),
  type: MessageTypeSchema,
  taskId: TaskIdSchema.nullable(),
  content: z.string(),
  correlationId: z.string().min(1).nullable(),
  createdAt: TimestampSchema,
})

export type AgentMessage = z.infer<typeof AgentMessageSchema>

export interface CreateMessageInput {
  id?: string
  workflowId: string
  senderId: string
  receiverId?: string | null
  type: MessageType
  taskId?: string | null
  content: string
  correlationId?: string | null
}
