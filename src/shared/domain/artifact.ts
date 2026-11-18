import { z } from 'zod'
import {
  AgentIdSchema,
  ArtifactIdSchema,
  TaskIdSchema,
  TimestampSchema,
  WorkflowIdSchema,
} from './ids'

export const ArtifactKindSchema = z.enum([
  'plan',
  'diff',
  'patch',
  'test_output',
  'review_report',
  'log',
  'summary',
])

export type ArtifactKind = z.infer<typeof ArtifactKindSchema>

export const ArtifactSchema = z.object({
  id: ArtifactIdSchema,
  workflowId: WorkflowIdSchema,
  taskId: TaskIdSchema.nullable(),
  agentId: AgentIdSchema.nullable(),
  kind: ArtifactKindSchema,
  name: z.string().min(1),
  filePath: z.string().min(1),
  checksum: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative(),
  supersedes: ArtifactIdSchema.nullable(),
  createdAt: TimestampSchema,
})

export type Artifact = z.infer<typeof ArtifactSchema>

export interface CreateArtifactInput {
  id?: string
  workflowId: string
  taskId?: string | null
  agentId?: string | null
  kind: ArtifactKind
  name: string
  filePath: string
  checksum?: string | null
  sizeBytes?: number
  supersedes?: string | null
}
