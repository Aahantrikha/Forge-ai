import { z } from 'zod'
import { AgentIdSchema, TaskIdSchema, TimestampSchema, WorkflowIdSchema } from './ids'

export const TaskTypeSchema = z.enum([
  'planning',
  'research',
  'coding',
  'testing',
  'review',
  'integration',
])

export const TaskStatusSchema = z.enum([
  'pending',
  'ready',
  'running',
  'blocked',
  'review',
  'completed',
  'failed',
  'cancelled',
])

export type TaskType = z.infer<typeof TaskTypeSchema>
export type TaskStatus = z.infer<typeof TaskStatusSchema>

export const ExecutionLimitsSchema = z.object({
  timeoutMs: z.number().int().positive(),
  tokenBudget: z.number().int().nonnegative(),
  maxRetries: z.number().int().nonnegative(),
  maxRecursionDepth: z.number().int().nonnegative(),
})

export type ExecutionLimits = z.infer<typeof ExecutionLimitsSchema>

export const TaskSchema = z.object({
  id: TaskIdSchema,
  workflowId: WorkflowIdSchema,
  parentTaskId: TaskIdSchema.nullable(),
  objective: z.string().min(1),
  description: z.string(),
  taskType: TaskTypeSchema,
  status: TaskStatusSchema,
  dependencies: z.array(TaskIdSchema),
  expectedOutput: z.string(),
  acceptanceCriteria: z.array(z.string()),
  fileOwnership: z.array(z.string()),
  assignedAgentId: AgentIdSchema.nullable(),
  priority: z.number().int(),
  maxAttempts: z.number().int().positive(),
  attemptCount: z.number().int().nonnegative(),
  executionLimits: ExecutionLimitsSchema,
  resultSummary: z.string().nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  startedAt: TimestampSchema.nullable(),
  completedAt: TimestampSchema.nullable(),
})

export type Task = z.infer<typeof TaskSchema>

export interface CreateTaskInput {
  id?: string
  workflowId: string
  parentTaskId?: string | null
  objective: string
  description?: string
  taskType: TaskType
  dependencies?: string[]
  expectedOutput?: string
  acceptanceCriteria?: string[]
  fileOwnership?: string[]
  priority?: number
  maxAttempts?: number
  executionLimits?: Partial<ExecutionLimits>
}
