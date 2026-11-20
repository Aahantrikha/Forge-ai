import type { AgentModel, ProviderId } from './agent'

export interface ModelCatalogEntry {
  providerId: ProviderId
  models: AgentModel[]
}

export interface ModelUsageSummary {
  workflowId: string | null
  sessions: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  costEstimate: number
}
