import { z } from 'zod'
import {
  AgentIdSchema,
  ArtifactIdSchema,
  IdSchema,
  ModelSessionIdSchema,
  TaskIdSchema,
  TimestampSchema,
  WorkflowIdSchema,
} from './ids'

export const ModelSessionStatusSchema = z.enum(['active', 'closed', 'error'])
export type ModelSessionStatus = z.infer<typeof ModelSessionStatusSchema>

export const ModelSessionSchema = z.object({
  id: ModelSessionIdSchema,
  workflowId: WorkflowIdSchema.nullable(),
  agentId: AgentIdSchema.nullable(),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  providerSessionId: z.string().nullable(),
  status: ModelSessionStatusSchema,
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  costEstimate: z.number().nullable(),
  createdAt: TimestampSchema,
  closedAt: TimestampSchema.nullable(),
})

export type ModelSession = z.infer<typeof ModelSessionSchema>

export const ExecutionStatusSchema = z.enum(['running', 'completed', 'failed', 'cancelled', 'timed_out'])
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>

export const ExecutionRecordSchema = z.object({
  id: IdSchema,
  workflowId: WorkflowIdSchema,
  taskId: TaskIdSchema.nullable(),
  agentId: AgentIdSchema.nullable(),
  kind: z.enum(['command', 'test', 'tool', 'git']),
  command: z.string(),
  workingDirectory: z.string(),
  status: ExecutionStatusSchema,
  exitCode: z.number().int().nullable(),
  outputRef: ArtifactIdSchema.nullable(),
  timeoutMs: z.number().int().positive(),
  startedAt: TimestampSchema,
  finishedAt: TimestampSchema.nullable(),
})

export type ExecutionRecord = z.infer<typeof ExecutionRecordSchema>

export const CheckpointSchema = z.object({
  id: IdSchema,
  workflowId: WorkflowIdSchema,
  reason: z.string().min(1),
  stateSnapshot: z.record(z.string(), z.unknown()),
  baseCommit: z.string().nullable(),
  restoredAt: TimestampSchema.nullable(),
  restoreCount: z.number().int().nonnegative(),
  createdAt: TimestampSchema,
})

export type Checkpoint = z.infer<typeof CheckpointSchema>
