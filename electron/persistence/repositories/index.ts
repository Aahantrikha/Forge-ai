import type { ForgeDatabase } from '../database'
import { ProjectRepository } from './project-repository'
import { WorkflowRepository } from './workflow-repository'
import { TaskRepository } from './task-repository'
import { AgentRepository } from './agent-repository'
import { AgentTaskRepository } from './agent-task-repository'
import { MessageRepository } from './message-repository'
import { ArtifactRepository } from './artifact-repository'
import { ApprovalRepository } from './approval-repository'
import { EventRepository } from './event-repository'
import { ModelSessionRepository } from './model-session-repository'
import { ExecutionRecordRepository } from './execution-record-repository'
import { CheckpointRepository } from './checkpoint-repository'

export interface Repositories {
  projects: ProjectRepository
  workflows: WorkflowRepository
  tasks: TaskRepository
  agents: AgentRepository
  agentTasks: AgentTaskRepository
  messages: MessageRepository
  artifacts: ArtifactRepository
  approvals: ApprovalRepository
  events: EventRepository
  modelSessions: ModelSessionRepository
  executions: ExecutionRecordRepository
  checkpoints: CheckpointRepository
}

export function createRepositories(store: ForgeDatabase): Repositories {
  return {
    projects: new ProjectRepository(store),
    workflows: new WorkflowRepository(store),
    tasks: new TaskRepository(store),
    agents: new AgentRepository(store),
    agentTasks: new AgentTaskRepository(store),
    messages: new MessageRepository(store),
    artifacts: new ArtifactRepository(store),
    approvals: new ApprovalRepository(store),
    events: new EventRepository(store),
    modelSessions: new ModelSessionRepository(store),
    executions: new ExecutionRecordRepository(store),
    checkpoints: new CheckpointRepository(store),
  }
}

export * from './project-repository'
export * from './workflow-repository'
export * from './task-repository'
export * from './agent-repository'
export * from './agent-task-repository'
export * from './message-repository'
export * from './artifact-repository'
export * from './approval-repository'
export * from './event-repository'
export * from './model-session-repository'
export * from './execution-record-repository'
export * from './checkpoint-repository'
