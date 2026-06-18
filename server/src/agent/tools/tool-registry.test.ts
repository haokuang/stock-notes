import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'
import {
  AgentExecutionContext,
  AgentTool,
  AgentToolNotFoundError,
  AgentToolValidationError,
} from './tool.types'
import { AgentToolRegistry, zodToJsonSchema } from './tool-registry'

function makeContext(): AgentExecutionContext {
  return {
    userId: 'user-1',
    stockId: 'stock-1',
    threadId: 'thread-1',
    runId: 'run-1',
    signal: new AbortController().signal,
  }
}

test('registry rejects tools that declare identity fields in their input schema', () => {
  const forbidden: AgentTool<{ userId: string }> = {
    name: 'leaky',
    description: 'leaks',
    input: z.object({ userId: z.string() }),
    execute: async () => 'should-not-run',
  }
  assert.throws(() => new AgentToolRegistry({ tools: [forbidden] }), /userId/)
})

test('registry rejects unknown tool names at execution', async () => {
  const registry = new AgentToolRegistry({ tools: [] })
  await assert.rejects(
    registry.execute('missing', {}, makeContext()),
    (error: unknown) => error instanceof AgentToolNotFoundError,
  )
})

test('registry never invokes handler when args fail validation', async () => {
  let called = 0
  const tool: AgentTool<{ limit: number }> = {
    name: 'bounded',
    description: 'bounded',
    input: z.object({ limit: z.number().min(1).max(5) }),
    execute: async () => {
      called += 1
      return 'ok'
    },
  }
  const registry = new AgentToolRegistry({ tools: [tool] })
  await assert.rejects(
    registry.execute('bounded', { limit: 999 }, makeContext()),
    (error: unknown) => error instanceof AgentToolValidationError,
  )
  assert.equal(called, 0)
})

test('registry passes parsed input and execution context to the handler', async () => {
  let received: { input: unknown; ctx: AgentExecutionContext | null } = { input: null, ctx: null }
  const tool: AgentTool<{ limit: number }> = {
    name: 'ok',
    description: 'ok',
    input: z.object({ limit: z.number().min(1).max(5) }),
    execute: async (ctx, input) => {
      received = { input, ctx }
      return 'ok'
    },
  }
  const registry = new AgentToolRegistry({ tools: [tool] })
  const ctx = makeContext()
  const result = await registry.execute('ok', { limit: 3 }, ctx)
  assert.equal(result, 'ok')
  assert.deepEqual(received.input, { limit: 3 })
  assert.equal(received.ctx?.userId, 'user-1')
})

test('zodToJsonSchema sets additionalProperties false and emits required', () => {
  const schema = z.object({ query: z.string(), maxResults: z.number().optional() })
  const json = zodToJsonSchema(schema) as {
    additionalProperties?: boolean
    required?: string[]
    properties?: Record<string, unknown>
  }
  assert.equal(json.additionalProperties, false)
  assert.deepEqual(json.required, ['query'])
  assert.ok(json.properties?.query)
})