import { z } from 'zod'
import {
  AgentIdSchema,
  ApprovalIdSchema,
  ArtifactIdSchema,
  TaskIdSchema,
  TimestampSchema,
  WorkflowIdSchema,
} from './ids'

export const ApprovalActionSchema = z.enum([
  'plan',
  'dependency_install',
  'config_change',
  'file_delete',
  'external_access',
  'db_migration',
  'git_merge',
  'remote_push',
])

export const ApprovalStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'modification_requested',
  'expired',
  'cancelled',
])

export type ApprovalAction = z.infer<typeof ApprovalActionSchema>
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>

export const ApprovalSchema = z.object({
  id: ApprovalIdSchema,
  workflowId: WorkflowIdSchema,
  taskId: TaskIdSchema.nullable(),
  agentId: AgentIdSchema.nullable(),
  actionType: ApprovalActionSchema,
  requestedAction: z.string().min(1),
  reason: z.string(),
  affectedFiles: z.array(z.string()),
  proposedCommand: z.string().nullable(),
  impact: z.string(),
  actionPayloadHash: z.string().min(1),
  proposedPatchRef: ArtifactIdSchema.nullable(),
  status: ApprovalStatusSchema,
  requestedBy: z.string().min(1),
  decidedBy: z.string().nullable(),
  decisionNote: z.string().nullable(),
  expiresAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  decidedAt: TimestampSchema.nullable(),
})

export type Approval = z.infer<typeof ApprovalSchema>

export interface CreateApprovalInput {
  id?: string
  workflowId: string
  taskId?: string | null
  agentId?: string | null
  actionType: ApprovalAction
  requestedAction: string
  reason: string
  affectedFiles?: string[]
  proposedCommand?: string | null
  impact: string
  actionPayloadHash: string
  proposedPatchRef?: string | null
  requestedBy: string
  expiresAt?: number | null
}
