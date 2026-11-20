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

export const AgentRoleSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9-]*$/, 'Role must use lowercase letters, numbers and hyphens.')

export const RoleProfileSchema = z.object({
  role: AgentRoleSchema,
  description: z.string().min(1),
  systemInstructions: z.string().min(1),
  allowedTools: z.array(ToolNameSchema).min(1),
  filesystemPermissions: FilesystemPermissionsSchema,
  defaultModelConfig: ModelConfigSchema,
  executionLimits: ExecutionLimitsSchema,
})

export type AgentRole = z.infer<typeof AgentRoleSchema>
export type RoleProfile = z.infer<typeof RoleProfileSchema>

export const SpawnAgentRequestSchema = z.object({
  workflowId: WorkflowIdSchema,
  role: AgentRoleSchema,
  objective: z.string().min(1),
  taskId: z.string().min(1).optional(),
  parentAgentId: z.string().min(1).optional(),
  workingDirectory: z.string().min(1),
  modelConfig: ModelConfigSchema.optional(),
  executionLimits: ExecutionLimitsSchema.partial().optional(),
  dynamicProfile: RoleProfileSchema.omit({ role: true }).optional(),
})

export type SpawnAgentRequest = z.infer<typeof SpawnAgentRequestSchema>

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
