import { describe, expect, it } from 'vitest'
import type { ForgeDatabase } from '../../../electron/persistence/database'
import type { Repositories } from '../../../electron/persistence/repositories'
import type { Agent, Project, Task, Workflow } from '../../../src/shared/domain'
import { withTempContext } from '../../helpers'

interface Seeded {
  database: ForgeDatabase
  repositories: Repositories
  project: Project
  workflow: Workflow
  task: Task
  agent: Agent
}

function withSeededContext<T>(fn: (value: Seeded) => T): T {
  return withTempContext(({ database, repositories }) => {
    const project = repositories.projects.upsert({ name: 'Demo', path: 'C:/repo/demo' })
    const workflow = repositories.workflows.create({
      projectId: project.id,
      objective: 'Ship a health check',
      baseBranch: 'main',
    })
    const task = repositories.tasks.create({
      workflowId: workflow.id,
      objective: 'Implement handler',
      taskType: 'coding',
      acceptanceCriteria: ['Tests pass'],
      fileOwnership: ['src/health.ts'],
    })
    const agent = repositories.agents.create({
      workflowId: workflow.id,
      role: 'coder',
      systemInstructions: 'Implement the task',
      modelConfig: { providerId: 'opencode', modelId: 'free-model' },
      availableTools: ['read_file', 'write_file'],
      filesystemPermissions: { roots: ['C:/repo/demo'], writableOwnership: ['src/**'] },
      workingDirectory: 'C:/repo/demo',
    })
    return fn({ database, repositories, project, workflow, task, agent })
  })
}

describe('repositories', () => {
  it('persists and updates projects, workflows, tasks, and agents', () => {
    withSeededContext(({ repositories, project, workflow, task, agent }) => {
      expect(repositories.projects.getByPath('C:/repo/demo')?.id).toBe(project.id)
      expect(repositories.workflows.listByProject(project.id)).toHaveLength(1)
      expect(repositories.workflows.update(workflow.id, { status: 'executing', startedAt: Date.now() })).toMatchObject({
        status: 'executing',
      })
      expect(repositories.tasks.update(task.id, { status: 'running', attemptCount: 1 })).toMatchObject({
        status: 'running',
        attemptCount: 1,
      })
      expect(repositories.agents.update(agent.id, { status: 'running', tokensUsed: 42 })).toMatchObject({
        status: 'running',
        tokensUsed: 42,
      })
      expect(repositories.agents.countActive(workflow.id)).toBe(1)
    })
  })

  it('tracks agent-task assignments with attempts', () => {
    withSeededContext(({ repositories, task, agent }) => {
      const assignment = repositories.agentTasks.assign(agent.id, task.id, 1)
      expect(assignment).toMatchObject({ agentId: agent.id, taskId: task.id, attempt: 1, status: 'assigned' })
      repositories.agentTasks.setStatus(assignment.id, 'running')
      expect(repositories.agentTasks.getById(assignment.id)).toMatchObject({ status: 'running' })
      expect(repositories.agentTasks.listByTask(task.id)).toHaveLength(1)
      expect(repositories.agentTasks.listByAgent(agent.id)).toHaveLength(1)
    })
  })

  it('stores agent messages idempotently by id', () => {
    withSeededContext(({ repositories, workflow, agent }) => {
      const id = 'msg-fixed'
      const input = {
        id,
        workflowId: workflow.id,
        senderId: 'orchestrator',
        receiverId: agent.id,
        type: 'question' as const,
        content: 'What is the status?',
      }
      expect(repositories.messages.create(input).id).toBe(id)
      expect(repositories.messages.create(input).id).toBe(id)
      expect(repositories.messages.listByWorkflow(workflow.id).filter((message) => message.id === id)).toHaveLength(1)
      expect(repositories.messages.listByReceiver(agent.id, workflow.id)).toHaveLength(1)
    })
  })

  it('stores artifacts and guards approval decisions by payload hash', () => {
    withSeededContext(({ repositories, workflow, task, agent }) => {
      const artifact = repositories.artifacts.create({
        workflowId: workflow.id,
        taskId: task.id,
        agentId: agent.id,
        kind: 'plan',
        name: 'plan.md',
        filePath: 'C:/repo/demo/.forge/plan.md',
      })
      expect(repositories.artifacts.listByTask(task.id)).toHaveLength(1)

      const approval = repositories.approvals.create({
        workflowId: workflow.id,
        actionType: 'plan',
        requestedAction: 'Approve plan',
        reason: 'Plan review',
        impact: 'none',
        actionPayloadHash: 'hash-1',
        proposedPatchRef: artifact.id,
        requestedBy: 'orchestrator',
      })
      expect(repositories.approvals.decide(approval.id, 'approved', 'user', null, 'wrong-hash')?.status).toBe('pending')
      expect(repositories.approvals.decide(approval.id, 'approved', 'user', 'Looks good', 'hash-1')).toMatchObject({
        status: 'approved',
        decidedBy: 'user',
      })
      expect(repositories.approvals.listPending()).toHaveLength(0)
    })
  })

  it('tracks model sessions, executions, and checkpoints', () => {
    withSeededContext(({ repositories, workflow, task, agent }) => {
      const session = repositories.modelSessions.create({
        workflowId: workflow.id,
        agentId: agent.id,
        providerId: 'opencode',
        modelId: 'free-model',
        providerSessionId: 'opencode-1',
      })
      repositories.modelSessions.updateUsage(session.id, { inputTokens: 10, outputTokens: 5, costEstimate: 0 })
      expect(repositories.modelSessions.getById(session.id)).toMatchObject({ inputTokens: 10, outputTokens: 5 })
      repositories.modelSessions.close(session.id)
      expect(repositories.modelSessions.getById(session.id)?.status).toBe('closed')
      expect(repositories.modelSessions.listByAgent(agent.id)).toHaveLength(1)

      const artifact = repositories.artifacts.create({
        workflowId: workflow.id,
        kind: 'test_output',
        name: 'test.log',
        filePath: 'C:/repo/demo/.forge/test.log',
      })
      const execution = repositories.executions.start({
        workflowId: workflow.id,
        taskId: task.id,
        agentId: agent.id,
        kind: 'command',
        command: 'npm test',
        workingDirectory: 'C:/repo/demo',
        timeoutMs: 60_000,
      })
      repositories.executions.finish(execution.id, 'completed', 0, artifact.id)
      expect(repositories.executions.getById(execution.id)).toMatchObject({
        status: 'completed',
        exitCode: 0,
        outputRef: artifact.id,
      })
      expect(repositories.executions.listByWorkflow(workflow.id)).toHaveLength(1)

      const checkpoint = repositories.checkpoints.create(workflow.id, 'before-merge', { taskCount: 1 }, 'abc123')
      expect(checkpoint.restoreCount).toBe(0)
      repositories.checkpoints.markRestored(checkpoint.id)
      expect(repositories.checkpoints.getById(checkpoint.id)).toMatchObject({ restoreCount: 1 })
      expect(repositories.checkpoints.latest(workflow.id)?.id).toBe(checkpoint.id)
    })
  })

  it('cascades project deletion to child records', () => {
    withSeededContext(({ repositories, database, project, workflow }) => {
      repositories.projects.delete(project.id)
      const workflows = database.db.prepare('SELECT COUNT(*) AS count FROM workflows WHERE project_id = ?').get(workflow.id) as {
        count: number
      }
      expect(workflows.count).toBe(0)
    })
  })
})
