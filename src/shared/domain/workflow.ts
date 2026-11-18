import { z } from 'zod'
import { ArtifactIdSchema, IdSchema, ProjectIdSchema, TimestampSchema, WorkflowIdSchema } from './ids'

export const WorkflowStatusSchema = z.enum([
  'planning',
  'awaiting_approval',
  'executing',
  'blocked',
  'integration_review',
  'awaiting_merge_approval',
  'completed',
  'failed',
  'cancelled',
])

export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>

export const WorkflowSchema = z.object({
  id: WorkflowIdSchema,
  projectId: ProjectIdSchema,
  objective: z.string().min(1),
  status: WorkflowStatusSchema,
  planArtifactId: ArtifactIdSchema.nullable(),
  baseCommit: z.string().nullable(),
  baseBranch: z.string().nullable(),
  failureReason: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  startedAt: TimestampSchema.nullable(),
  completedAt: TimestampSchema.nullable(),
})

export type Workflow = z.infer<typeof WorkflowSchema>

export interface CreateWorkflowInput {
  id?: string
  projectId: string
  objective: string
  baseCommit?: string | null
  baseBranch?: string | null
  metadata?: Record<string, unknown> | null
}

export const ProjectSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  path: z.string().min(1),
  repoRemote: z.string().nullable(),
  defaultBranch: z.string().nullable(),
  lastOpenedAt: TimestampSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
})

export type Project = z.infer<typeof ProjectSchema>
