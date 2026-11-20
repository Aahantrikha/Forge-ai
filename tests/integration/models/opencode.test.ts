import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '../../../src/shared/agent'
import { OpencodeAdapter } from '../../../electron/agents/opencode'
import { createForgeContext, disposeForgeContext } from '../../../electron/context'
import { ModelGateway } from '../../../electron/models/model-gateway'
import { ProviderRegistry } from '../../../electron/models/provider-registry'

const enabled = process.env.FORGE_OPENCODE_INTEGRATION === '1'

function waitForEvent(events: AgentEvent[], predicate: (event: AgentEvent) => boolean, timeoutMs: number): Promise<AgentEvent> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const check = () => {
      const match = events.find(predicate)
      if (match) {
        resolve(match)
        return
      }
      if (Date.now() - started >= timeoutMs) {
        reject(new Error('Timed out waiting for a real OpenCode stream event.'))
        return
      }
      setTimeout(check, 50)
    }
    check()
  })
}

describe.skipIf(!enabled)('OpenCode model gateway integration', () => {
  it('creates a real session, streams an event, then cancels it', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-opencode-'))
    const context = createForgeContext(dir)
    const registry = new ProviderRegistry()
    const events: AgentEvent[] = []
    const gateway = new ModelGateway(
      registry,
      context.repositories.modelSessions,
      context.events,
      context.logger,
      { timeoutMs: 90_000, maxAttempts: 1, eventSink: (event) => events.push(event) }
    )
    registry.register(new OpencodeAdapter((event) => gateway.ingestProviderEvent(event)))

    try {
      context.repositories.projects.upsert({ id: 'project-opencode', name: 'Integration', path: dir })
      context.repositories.workflows.create({
        id: 'integration-opencode',
        projectId: 'project-opencode',
        objective: 'Verify real OpenCode streaming and cancellation',
      })
      const session = await gateway.createSession({
        providerId: 'opencode',
        workspacePath: dir,
        modelId: process.env.FORGE_MODEL_ID ?? 'opencode/big-pickle',
        workflowId: 'integration-opencode',
      })

      const prompt = gateway.submitPrompt({ sessionId: session.id, prompt: 'Reply with the single word OK.' })
      const streamed = await waitForEvent(events, (event) => event.type === 'text_delta', 60_000)
      expect(streamed.sessionId).toBe(session.providerSessionId)

      await gateway.cancel(session.id)
      await prompt.catch(() => undefined)

      expect(context.repositories.modelSessions.getById(session.id)?.status).toBe('closed')
    } finally {
      await gateway.dispose()
      disposeForgeContext(context)
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
