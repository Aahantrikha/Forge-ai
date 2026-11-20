import { z } from 'zod'
import { AgentIdSchema, TaskIdSchema, WorkflowIdSchema, TimestampSchema } from './ids'

export const EventTypeSchema = z.enum([
  'workflow:created',
  'workflow:updated',
  'workflow:completed',
  'workflow:failed',
  'agent:created',
  'agent:started',
  'agent:updated',
  'agent:completed',
  'agent:failed',
  'task:created',
  'task:assigned',
  'task:completed',
  'task:blocked',
  'message:received',
  'artifact:created',
  'approval:required',
  'approval:completed',
  'execution:started',
  'execution:completed',
  'model:session-created',
  'model:usage',
  'model:error',
])

export type EventType = z.infer<typeof EventTypeSchema>

export const ForgeEventSchema = z.object({
  eventId: z.string().min(1),
  workflowId: WorkflowIdSchema.nullable(),
  agentId: AgentIdSchema.nullable(),
  taskId: TaskIdSchema.nullable(),
  type: EventTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  correlationId: z.string().min(1).optional(),
  causationId: z.string().min(1).optional(),
  sequence: z.number().int().nonnegative(),
  occurredAt: TimestampSchema,
})

export type ForgeEvent = z.infer<typeof ForgeEventSchema>

export interface EventDraft {
  eventId?: string
  workflowId?: string | null
  agentId?: string | null
  taskId?: string | null
  type: EventType
  payload?: Record<string, unknown>
  correlationId?: string
  causationId?: string
  occurredAt?: number
}
