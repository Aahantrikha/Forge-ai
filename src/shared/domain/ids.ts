import { z } from 'zod'

export const IdSchema = z.string().min(1)
export const WorkflowIdSchema = IdSchema
export const TaskIdSchema = IdSchema
export const AgentIdSchema = IdSchema
export const ProviderIdSchema = z.string().min(1)
export const ModelSessionIdSchema = IdSchema
export const MessageIdSchema = IdSchema
export const ArtifactIdSchema = IdSchema
export const ApprovalIdSchema = IdSchema
export const ProjectIdSchema = IdSchema
export const EventIdSchema = IdSchema

export type Id = z.infer<typeof IdSchema>
export type WorkflowId = z.infer<typeof WorkflowIdSchema>
export type TaskId = z.infer<typeof TaskIdSchema>
export type AgentId = z.infer<typeof AgentIdSchema>
export type ProviderId = z.infer<typeof ProviderIdSchema>
export type ModelSessionId = z.infer<typeof ModelSessionIdSchema>
export type MessageId = z.infer<typeof MessageIdSchema>
export type ArtifactId = z.infer<typeof ArtifactIdSchema>
export type ApprovalId = z.infer<typeof ApprovalIdSchema>
export type ProjectId = z.infer<typeof ProjectIdSchema>
export type EventId = z.infer<typeof EventIdSchema>

export function newId(): Id {
  return globalThis.crypto.randomUUID()
}

export const TimestampSchema = z.number().int().nonnegative()
