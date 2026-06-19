import assert from 'node:assert/strict'
import test from 'node:test'
import { MODULE_METADATA } from '@nestjs/common/constants'
import {
  AGENT_ORCHESTRATOR,
  AGENT_PROVIDER_REGISTRY,
  AGENT_RECOVERY,
  AGENT_RUN_QUEUE,
  AGENT_RUNTIME,
  AGENT_WORKER,
  AgentModule,
} from './agent.module'

test('AgentModule wires the complete queued-run execution graph', () => {
  const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AgentModule) as Array<unknown>
  const tokens = new Set(providers.map((provider) => {
    if (provider && typeof provider === 'object' && 'provide' in provider) return (provider as { provide: unknown }).provide
    return provider
  }))
  for (const token of [
    AGENT_PROVIDER_REGISTRY,
    AGENT_ORCHESTRATOR,
    AGENT_RUN_QUEUE,
    AGENT_WORKER,
    AGENT_RECOVERY,
    AGENT_RUNTIME,
  ]) {
    assert.ok(tokens.has(token), `missing provider ${String(token)}`)
  }
})
