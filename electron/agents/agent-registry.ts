import { ForgeErrorImpl } from '../../src/shared/errors'
import type { Agent } from '../../src/shared/domain'

export class AgentRegistry {
  private readonly agents = new Map<string, Agent>()

  register(agent: Agent): Agent {
    this.agents.set(agent.id, agent)
    return agent
  }

  get(agentId: string): Agent | null {
    return this.agents.get(agentId) ?? null
  }

  require(agentId: string): Agent {
    const agent = this.agents.get(agentId)
    if (!agent) {
      throw new ForgeErrorImpl('NOT_FOUND', `Agent "${agentId}" is not registered.`, { agentId })
    }
    return agent
  }

  list(): Agent[] {
    return [...this.agents.values()]
  }

  listByWorkflow(workflowId: string): Agent[] {
    return [...this.agents.values()].filter((agent) => agent.workflowId === workflowId)
  }

  countActive(workflowId?: string): number {
    return [...this.agents.values()].filter(
      (agent) =>
        (!workflowId || agent.workflowId === workflowId) &&
        ['initializing', 'running', 'waiting'].includes(agent.status)
    ).length
  }

  unregister(agentId: string): void {
    this.agents.delete(agentId)
  }

  clear(): void {
    this.agents.clear()
  }
}
