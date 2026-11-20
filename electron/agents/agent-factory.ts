import {
  ModelConfigSchema,
  newId,
  SpawnAgentRequestSchema,
  type Agent,
  type SpawnAgentRequest,
} from '../../src/shared/domain'
import { ForgeErrorImpl } from '../../src/shared/errors'
import type { TypedEventBus } from '../coordination/event-bus'
import type { StructuredLogger } from '../observability/logger'
import type { Repositories } from '../persistence/repositories'
import type { ModelGateway } from '../models/model-gateway'
import { buildSystemInstructions, resolveRoleProfile } from './agent-prompts/roles'

export interface SpawnAgentResult {
  agent: Agent
  modelSessionId: string
}

export class AgentFactory {
  constructor(
    private readonly repositories: Repositories,
    private readonly gateway: ModelGateway,
    private readonly events: TypedEventBus,
    private readonly logger: StructuredLogger
  ) {}

  async spawn(input: SpawnAgentRequest): Promise<SpawnAgentResult> {
    const request = SpawnAgentRequestSchema.parse(input)
    const profile = resolveRoleProfile(request.role, request.dynamicProfile)
    const modelConfig = request.modelConfig
      ? ModelConfigSchema.parse(request.modelConfig)
      : profile.defaultModelConfig
    const executionLimits = { ...profile.executionLimits, ...request.executionLimits }
    const roots = profile.filesystemPermissions.roots.length
      ? profile.filesystemPermissions.roots
      : [request.workingDirectory]
    const id = newId()

    this.repositories.agents.create({
      id,
      workflowId: request.workflowId,
      role: profile.role,
      systemInstructions: buildSystemInstructions(profile, request.objective),
      modelConfig,
      availableTools: profile.allowedTools,
      filesystemPermissions: {
        roots,
        writableOwnership: profile.filesystemPermissions.writableOwnership,
      },
      workingDirectory: request.workingDirectory,
      executionLimits,
    })

    let modelSessionId: string
    try {
      const session = await this.gateway.createSession({
        providerId: modelConfig.providerId,
        workspacePath: request.workingDirectory,
        modelId: modelConfig.modelId,
        workflowId: request.workflowId,
        agentId: id,
        taskId: request.taskId,
      })
      modelSessionId = session.id
    } catch (error) {
      this.repositories.agents.delete(id)
      throw error
    }

    const updated = this.repositories.agents.update(id, { modelSessionId })
    if (!updated) {
      throw new ForgeErrorImpl('INTERNAL', 'Agent record disappeared after session creation.', { agentId: id })
    }

    this.events.emit({
      workflowId: updated.workflowId,
      agentId: updated.id,
      taskId: request.taskId ?? null,
      type: 'agent:created',
      payload: {
        role: updated.role,
        providerId: modelConfig.providerId,
        modelId: modelConfig.modelId,
        modelSessionId,
      },
    })
    this.logger.info('agent:created', {
      agentId: updated.id,
      workflowId: updated.workflowId,
      role: updated.role,
    })

    return { agent: updated, modelSessionId }
  }
}
