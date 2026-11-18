import { describe, expect, it } from 'vitest'
import {
  ApprovalSchema,
  ForgeEventSchema,
  TaskSchema,
  WorkflowSchema,
} from '../../../src/shared/domain'
import { IpcArgs, IpcValidationError, validateArgs } from '../../../electron/ipc/validation'

const timestamp = Date.now()

const workflow = {
  id: 'wf-1',
  projectId: 'pr-1',
  objective: 'Add a health check endpoint',
  status: 'planning',
  planArtifactId: null,
  baseCommit: null,
  baseBranch: 'main',
  failureReason: null,
  metadata: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  startedAt: null,
  completedAt: null,
}

describe('domain schemas', () => {
  it('accepts a valid workflow and rejects an unknown status', () => {
    expect(WorkflowSchema.parse(workflow).id).toBe('wf-1')
    expect(WorkflowSchema.safeParse({ ...workflow, status: 'magical' }).success).toBe(false)
  })

  it('requires a task objective and valid acceptance criteria', () => {
    const task = {
      id: 'task-1',
      workflowId: 'wf-1',
      parentTaskId: null,
      objective: 'Implement handler',
      description: '',
      taskType: 'coding',
      status: 'pending',
      dependencies: [],
      expectedOutput: 'A new file',
      acceptanceCriteria: ['Tests pass'],
      fileOwnership: ['src/health.ts'],
      assignedAgentId: null,
      priority: 0,
      maxAttempts: 3,
      attemptCount: 0,
      executionLimits: { timeoutMs: 1000, tokenBudget: 100, maxRetries: 2, maxRecursionDepth: 1 },
      resultSummary: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: null,
      completedAt: null,
    }
    expect(TaskSchema.parse(task).objective).toBe('Implement handler')
    expect(TaskSchema.safeParse({ ...task, objective: '' }).success).toBe(false)
    expect(TaskSchema.safeParse({ ...task, acceptanceCriteria: [42] }).success).toBe(false)
  })

  it('rejects unknown event types', () => {
    const draft = {
      eventId: 'ev-1',
      workflowId: 'wf-1',
      agentId: null,
      taskId: null,
      type: 'agent:danced',
      payload: {},
      sequence: 0,
      occurredAt: timestamp,
    }
    expect(ForgeEventSchema.safeParse(draft).success).toBe(false)
  })

  it('requires an approval action hash', () => {
    const approval = {
      id: 'ap-1',
      workflowId: 'wf-1',
      taskId: null,
      agentId: null,
      actionType: 'plan',
      requestedAction: 'Approve plan',
      reason: 'Plan review',
      affectedFiles: [],
      proposedCommand: null,
      impact: 'none',
      actionPayloadHash: '',
      proposedPatchRef: null,
      status: 'pending',
      requestedBy: 'orchestrator',
      decidedBy: null,
      decisionNote: null,
      expiresAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      decidedAt: null,
    }
    expect(ApprovalSchema.safeParse(approval).success).toBe(false)
  })
})

describe('IPC argument validation', () => {
  it('accepts valid read-file arguments', () => {
    expect(validateArgs(IpcArgs.readFile, ['C:/repo/file.ts'], 'forge:workspace:read-file')).toEqual(['C:/repo/file.ts'])
  })

  it('rejects empty paths with a typed error', () => {
    expect(() => validateArgs(IpcArgs.readFile, [''], 'forge:workspace:read-file')).toThrow(IpcValidationError)
  })

  it('rejects malformed prompt options', () => {
    expect(() =>
      validateArgs(IpcArgs.submitPrompt, ['opencode', { sessionId: 's', prompt: '' }], 'forge:agent:submit-prompt')
    ).toThrow(IpcValidationError)
  })
})
