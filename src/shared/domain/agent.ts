import { z } from 'zod'
import {
  AgentIdSchema,
  ModelSessionIdSchema,
  TaskIdSchema,
  TimestampSchema,
  WorkflowIdSchema,
} from './ids'
import { ExecutionLimitsSchema } from './task'

export const AgentStatusSchema = z.enum([
  'idle',
  'initializing',
  'running',
  'waiting',
  'completed',
  'failed',
  'terminated',
])

export type AgentStatus = z.infer<typeof AgentStatusSchema>

export const ToolNameSchema = z.enum([
  'read_file',
  'write_file',
  'edit_file',
  'search_codebase',
  'list_directory',
  'execute_command',
  'run_tests',
  'inspect_git',
  'create_worktree',
  'create_artifact',
  'request_approval',
])

export type ToolName = z.infer<typeof ToolNameSchema>

export const ModelConfigSchema = z.object({
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  parameters: z.record(z.string(), z.unknown()).optional(),
})

export const FilesystemPermissionsSchema = z.object({
  roots: z.array(z.string()),
  writableOwnership: z.array(z.string()),
})

export const AgentSchema = z.object({
  id: AgentIdSchema,
  workflowId: WorkflowIdSchema,
  role: z.string().min(1),
  systemInstructions: z.string(),
  modelConfig: ModelConfigSchema,
  modelSessionId: ModelSessionIdSchema.nullable(),
  assignedTaskId: TaskIdSchema.nullable(),
  availableTools: z.array(ToolNameSchema),
  filesystemPermissions: FilesystemPermissionsSchema,
  workingDirectory: z.string().min(1),
  executionLimits: ExecutionLimitsSchema,
  tokensUsed: z.number().int().nonnegative(),
  status: AgentStatusSchema,
  heartbeatAt: TimestampSchema.nullable(),
  failureReason: z.string().nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  completedAt: TimestampSchema.nullable(),
})

export type Agent = z.infer<typeof AgentSchema>

export interface CreateAgentInput {
  id?: string
  workflowId: string
  role: string
  systemInstructions: string
  modelConfig: z.infer<typeof ModelConfigSchema>
  availableTools?: ToolName[]
  filesystemPermissions?: z.infer<typeof FilesystemPermissionsSchema>
  workingDirectory: string
  executionLimits?: Partial<z.infer<typeof ExecutionLimitsSchema>>
}

export const AgentTaskStatusSchema = z.enum(['assigned', 'running', 'completed', 'failed', 'released'])
export type AgentTaskStatus = z.infer<typeof AgentTaskStatusSchema>
