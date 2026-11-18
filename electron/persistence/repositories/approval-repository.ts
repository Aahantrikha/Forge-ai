import {
  ApprovalSchema,
  newId,
  type Approval,
  type ApprovalStatus,
  type CreateApprovalInput,
} from '../../../src/shared/domain'
import type { ForgeDatabase } from '../database'
import { now, parseJson, toJson } from './helpers'

interface ApprovalRow {
  id: string
  workflow_id: string
  task_id: string | null
  agent_id: string | null
  action_type: string
  requested_action: string
  reason: string
  affected_files: string
  proposed_command: string | null
  impact: string
  action_payload_hash: string
  proposed_patch_ref: string | null
  status: ApprovalStatus
  requested_by: string
  decided_by: string | null
  decision_note: string | null
  expires_at: number | null
  created_at: number
  updated_at: number
  decided_at: number | null
}

function map(row: ApprovalRow): Approval {
  return ApprovalSchema.parse({
    id: row.id,
    workflowId: row.workflow_id,
    taskId: row.task_id,
    agentId: row.agent_id,
    actionType: row.action_type,
    requestedAction: row.requested_action,
    reason: row.reason,
    affectedFiles: parseJson<string[]>(row.affected_files, []),
    proposedCommand: row.proposed_command,
    impact: row.impact,
    actionPayloadHash: row.action_payload_hash,
    proposedPatchRef: row.proposed_patch_ref,
    status: row.status,
    requestedBy: row.requested_by,
    decidedBy: row.decided_by,
    decisionNote: row.decision_note,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decidedAt: row.decided_at,
  })
}

export class ApprovalRepository {
  constructor(private readonly store: ForgeDatabase) {}

  create(input: CreateApprovalInput): Approval {
    const id = input.id ?? newId()
    const timestamp = now()
    this.store.db
      .prepare(`
        INSERT INTO approvals (
          id, workflow_id, task_id, agent_id, action_type, requested_action, reason,
          affected_files, proposed_command, impact, action_payload_hash, proposed_patch_ref,
          status, requested_by, decided_by, decision_note, expires_at, created_at, updated_at, decided_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, NULL, ?, ?, ?, NULL)
      `)
      .run(
        id,
        input.workflowId,
        input.taskId ?? null,
        input.agentId ?? null,
        input.actionType,
        input.requestedAction,
        input.reason,
        toJson(input.affectedFiles ?? []),
        input.proposedCommand ?? null,
        input.impact,
        input.actionPayloadHash,
        input.proposedPatchRef ?? null,
        input.requestedBy,
        input.expiresAt ?? null,
        timestamp,
        timestamp
      )
    return this.getById(id)!
  }

  getById(id: string): Approval | null {
    const row = this.store.db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as ApprovalRow | undefined
    return row ? map(row) : null
  }

  listByWorkflow(workflowId: string): Approval[] {
    return (
      this.store.db
        .prepare('SELECT * FROM approvals WHERE workflow_id = ? ORDER BY created_at DESC')
        .all(workflowId) as ApprovalRow[]
    ).map(map)
  }

  listPending(): Approval[] {
    return (this.store.db.prepare("SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at ASC").all() as ApprovalRow[]).map(
      map
    )
  }

  decide(id: string, status: ApprovalStatus, decidedBy: string, note: string | null, expectedHash: string): Approval | null {
    const approval = this.getById(id)
    if (!approval || approval.status !== 'pending') return approval
    if (approval.actionPayloadHash !== expectedHash) return approval
    const timestamp = now()
    this.store.db
      .prepare('UPDATE approvals SET status = ?, decided_by = ?, decision_note = ?, decided_at = ?, updated_at = ? WHERE id = ?')
      .run(status, decidedBy, note, timestamp, timestamp, id)
    return this.getById(id)
  }

  expirePastDue(timestamp: number): number {
    const result = this.store.db
      .prepare("UPDATE approvals SET status = 'expired', updated_at = ? WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at <= ?")
      .run(timestamp, timestamp)
    return result.changes
  }
}
