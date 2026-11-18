import { ModelSessionSchema, newId, type ModelSession } from '../../../src/shared/domain'
import type { ForgeDatabase } from '../database'
import { now } from './helpers'

interface SessionRow {
  id: string
  workflow_id: string | null
  agent_id: string | null
  provider_id: string
  model_id: string
  provider_session_id: string | null
  status: string
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  cost_estimate: number | null
  created_at: number
  closed_at: number | null
}

function map(row: SessionRow): ModelSession {
  return ModelSessionSchema.parse({
    id: row.id,
    workflowId: row.workflow_id,
    agentId: row.agent_id,
    providerId: row.provider_id,
    modelId: row.model_id,
    providerSessionId: row.provider_session_id,
    status: row.status,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheWriteTokens: row.cache_write_tokens,
    costEstimate: row.cost_estimate,
    createdAt: row.created_at,
    closedAt: row.closed_at,
  })
}

export interface CreateSessionRecordInput {
  id?: string
  workflowId?: string | null
  agentId?: string | null
  providerId: string
  modelId: string
  providerSessionId?: string | null
}

export class ModelSessionRepository {
  constructor(private readonly store: ForgeDatabase) {}

  create(input: CreateSessionRecordInput): ModelSession {
    const id = input.id ?? newId()
    this.store.db
      .prepare(`
        INSERT INTO model_sessions (
          id, workflow_id, agent_id, provider_id, model_id, provider_session_id,
          status, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
          cost_estimate, created_at, closed_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', 0, 0, 0, 0, NULL, ?, NULL)
      `)
      .run(id, input.workflowId ?? null, input.agentId ?? null, input.providerId, input.modelId, input.providerSessionId ?? null, now())
    return this.getById(id)!
  }

  getById(id: string): ModelSession | null {
    const row = this.store.db.prepare('SELECT * FROM model_sessions WHERE id = ?').get(id) as SessionRow | undefined
    return row ? map(row) : null
  }

  listByAgent(agentId: string): ModelSession[] {
    return (
      this.store.db.prepare('SELECT * FROM model_sessions WHERE agent_id = ? ORDER BY created_at ASC').all(agentId) as SessionRow[]
    ).map(map)
  }

  updateUsage(id: string, usage: Partial<Pick<ModelSession, 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens' | 'costEstimate'>>): void {
    const columns: Record<string, string> = {
      inputTokens: 'input_tokens',
      outputTokens: 'output_tokens',
      cacheReadTokens: 'cache_read_tokens',
      cacheWriteTokens: 'cache_write_tokens',
      costEstimate: 'cost_estimate',
    }
    const entries = Object.entries(usage).filter(([, value]) => value !== undefined) as Array<[string, number]>
    if (entries.length === 0) return
    const assignments = entries.map(([key]) => `${columns[key]} = ?`)
    this.store.db.prepare(`UPDATE model_sessions SET ${assignments.join(', ')} WHERE id = ?`).run(...entries.map(([, value]) => value), id)
  }

  close(id: string, status: 'closed' | 'error' = 'closed'): void {
    this.store.db.prepare('UPDATE model_sessions SET status = ?, closed_at = ? WHERE id = ?').run(status, now(), id)
  }
}
