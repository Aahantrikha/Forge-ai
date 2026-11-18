import { ExecutionRecordSchema, newId, type ExecutionRecord } from '../../../src/shared/domain'
import type { ForgeDatabase } from '../database'
import { now } from './helpers'

interface ExecutionRow {
  id: string
  workflow_id: string
  task_id: string | null
  agent_id: string | null
  kind: string
  command: string
  working_directory: string
  status: string
  exit_code: number | null
  output_ref: string | null
  timeout_ms: number
  started_at: number
  finished_at: number | null
}

function map(row: ExecutionRow): ExecutionRecord {
  return ExecutionRecordSchema.parse({
    id: row.id,
    workflowId: row.workflow_id,
    taskId: row.task_id,
    agentId: row.agent_id,
    kind: row.kind,
    command: row.command,
    workingDirectory: row.working_directory,
    status: row.status,
    exitCode: row.exit_code,
    outputRef: row.output_ref,
    timeoutMs: row.timeout_ms,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  })
}

export interface StartExecutionInput {
  workflowId: string
  taskId?: string | null
  agentId?: string | null
  kind: ExecutionRecord['kind']
  command: string
  workingDirectory: string
  timeoutMs: number
}

export class ExecutionRecordRepository {
  constructor(private readonly store: ForgeDatabase) {}

  start(input: StartExecutionInput): ExecutionRecord {
    const id = newId()
    this.store.db
      .prepare(`
        INSERT INTO execution_records (
          id, workflow_id, task_id, agent_id, kind, command, working_directory,
          status, exit_code, output_ref, timeout_ms, started_at, finished_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', NULL, NULL, ?, ?, NULL)
      `)
      .run(
        id,
        input.workflowId,
        input.taskId ?? null,
        input.agentId ?? null,
        input.kind,
        input.command,
        input.workingDirectory,
        input.timeoutMs,
        now()
      )
    return this.getById(id)!
  }

  getById(id: string): ExecutionRecord | null {
    const row = this.store.db.prepare('SELECT * FROM execution_records WHERE id = ?').get(id) as ExecutionRow | undefined
    return row ? map(row) : null
  }

  finish(id: string, status: ExecutionRecord['status'], exitCode: number | null, outputRef: string | null): void {
    this.store.db
      .prepare('UPDATE execution_records SET status = ?, exit_code = ?, output_ref = ?, finished_at = ? WHERE id = ?')
      .run(status, exitCode, outputRef, now(), id)
  }

  listByWorkflow(workflowId: string): ExecutionRecord[] {
    return (
      this.store.db
        .prepare('SELECT * FROM execution_records WHERE workflow_id = ? ORDER BY started_at DESC')
        .all(workflowId) as ExecutionRow[]
    ).map(map)
  }
}
