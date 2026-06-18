import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import assert from 'node:assert/strict'
import test from 'node:test'
import { submitAgentMessage } from './run-submission'
import { SubmitAgentMessageDto } from '../agent.dto'

function makeDto(partial: Partial<SubmitAgentMessageDto>): SubmitAgentMessageDto {
  return Object.assign(new SubmitAgentMessageDto(), partial)
}

interface StubHandler {
  match: RegExp
  rows?: unknown[]
  throw?: { code?: string; message: string }
}

function makeClient(handlers: StubHandler[]) {
  const calls: Array<{ text: string; values: unknown[] }> = []
  return {
    calls,
    query: async (text: string, values: unknown[] = []) => {
      calls.push({ text, values })
      if (/^(BEGIN|COMMIT|ROLLBACK)\b/i.test(text.trim())) return { rows: [] }
      const matched = handlers.find((h) => h.match.test(text))
      if (false) {
        console.log('Q FULL:', JSON.stringify(text))
      }
      if (matched) {
        if (matched.throw) {
          const err = new Error(matched.throw.message) as Error & { code?: string }
          err.code = matched.throw.code
          throw err
        }
        if (matched.rows && matched.rows.length > 0) {
          return { rows: [matched.rows.shift()] }
        }
        return { rows: [] }
      }
      throw new Error(`Unexpected query: ${text.slice(0, 80)}`)
    },
  }
}

test('SubmitAgentMessageDto validates content length and clientRequestId shape', async () => {
  const short = plainToInstance(SubmitAgentMessageDto, {
    content: '   ',
    provider: 'deepseek',
    model: 'deepseek-chat',
    clientRequestId: 'short',
  })
  const errors = await validate(short)
  assert.ok(errors.length >= 1)

  const tooLong = makeDto({
    content: 'x'.repeat(12_001),
    provider: 'deepseek',
    model: 'deepseek-chat',
    clientRequestId: 'a'.repeat(101),
  })
  const longErrors = await validate(tooLong)
  assert.ok(longErrors.length >= 2)

  const valid = plainToInstance(SubmitAgentMessageDto, {
    content: '  你好  ',
    provider: 'deepseek',
    model: 'deepseek-chat',
    clientRequestId: 'req-' + 'a'.repeat(20),
  })
  const validErrors = await validate(valid)
  assert.equal(validErrors.length, 0)
  assert.equal(valid.content, '你好')
})

test('submission returns inserted message and run for a valid request', async () => {
  const client = makeClient([
    { match: /FROM agent_threads WHERE user_id = \$1 AND id = \$2 FOR UPDATE/, rows: [{ id: 'thread-1', user_id: 'user-1', stock_id: 'stock-1', title: '贵州茅台' }] },
    { match: /FROM agent_runs[\s\S]*client_request_id[\s\S]*LIMIT 1/, rows: [] },
    { match: /WHERE thread_id = [\s\S]* status IN [\s\S]* FOR UPDATE/, rows: [] },
    { match: /INSERT INTO agent_messages/, rows: [{ id: 'msg-1' }] },
    { match: /INSERT INTO agent_runs/, rows: [{ id: 'run-1', created_at: '2026-06-18T10:00:00.000Z' }] },
  ])

  const result = await submitAgentMessage({
    userId: 'user-1',
    threadId: 'thread-1',
    dto: makeDto({
      content: '你好',
      provider: 'deepseek',
      model: 'deepseek-chat',
      clientRequestId: 'req-' + 'a'.repeat(20),
    }),
    client: client as never,
  })

  assert.equal(result.kind, 'inserted')
  if (result.kind === 'inserted') {
    assert.equal(result.run.id, 'run-1')
    assert.equal(result.message.id, 'msg-1')
  }
})

test('submission replays when the same clientRequestId already inserted a run', async () => {
  const client = makeClient([
    { match: /FROM agent_threads WHERE user_id = \$1 AND id = \$2 FOR UPDATE/, rows: [{ id: 'thread-1', user_id: 'user-1', stock_id: 'stock-1', title: '贵州茅台' }] },
    { match: /FROM agent_runs[\s\S]*client_request_id[\s\S]*LIMIT 1/, rows: [{ id: 'run-existing', status: 'queued', stage: 'queued', provider: 'deepseek', model: 'deepseek-chat', created_at: '2026-06-18T10:00:00.000Z' }] },
  ])

  const result = await submitAgentMessage({
    userId: 'user-1',
    threadId: 'thread-1',
    dto: makeDto({
      content: '你好',
      provider: 'deepseek',
      model: 'deepseek-chat',
      clientRequestId: 'req-' + 'a'.repeat(20),
    }),
    client: client as never,
  })

  assert.equal(result.kind, 'replay')
  if (result.kind === 'replay') {
    assert.equal(result.run.id, 'run-existing')
  }
})

test('submission rejects when another active run already exists for this thread', async () => {
  const client = makeClient([
    { match: /FROM agent_threads WHERE user_id = \$1 AND id = \$2 FOR UPDATE/, rows: [{ id: 'thread-1', user_id: 'user-1', stock_id: 'stock-1', title: '贵州茅台' }] },
    { match: /FROM agent_runs[\s\S]*client_request_id[\s\S]*LIMIT 1/, rows: [] },
    { match: /WHERE thread_id = [\s\S]* status IN [\s\S]* FOR UPDATE/, rows: [{ id: 'run-existing', status: 'running', stage: 'generating', provider: 'deepseek', model: 'deepseek-chat', created_at: '2026-06-18T09:00:00.000Z' }] },
  ])

  await assert.rejects(
    submitAgentMessage({
      userId: 'user-1',
      threadId: 'thread-1',
      dto: makeDto({
        content: 'hi',
        provider: 'deepseek',
        model: 'deepseek-chat',
        clientRequestId: 'req-' + 'b'.repeat(20),
      }),
      client: client as never,
    }),
    (error: { getResponse?: () => unknown }) => {
      const response = error.getResponse?.()
      const payload = typeof response === 'object' && response !== null ? (response as { code?: string }) : null
      return payload?.code === 'AGENT_ACTIVE_RUN'
    },
  )
})

test('submission rejects when the thread is not owned by the user', async () => {
  const client = makeClient([
    { match: /FROM agent_threads WHERE user_id = \$1 AND id = \$2 FOR UPDATE/, rows: [] },
  ])
  await assert.rejects(
    submitAgentMessage({
      userId: 'user-1',
      threadId: 'thread-1',
      dto: makeDto({
        content: 'hi',
        provider: 'deepseek',
        model: 'deepseek-chat',
        clientRequestId: 'req-' + 'c'.repeat(20),
      }),
      client: client as never,
    }),
    (error: { getStatus?: () => number }) => error.getStatus?.() === 404,
  )
})

test('submission rolls back and re-reads on unique race', async () => {
  const client = makeClient([
    { match: /FROM agent_threads WHERE user_id = \$1 AND id = \$2 FOR UPDATE/, rows: [{ id: 'thread-1', user_id: 'user-1', stock_id: 'stock-1', title: '贵州茅台' }] },
    { match: /WHERE thread_id = [\s\S]* status IN [\s\S]* FOR UPDATE/, rows: [] },
    { match: /INSERT INTO agent_messages/, throw: { code: '23505', message: 'duplicate' } },
    { match: /FROM agent_runs[\s\S]*client_request_id[\s\S]*LIMIT 1/, rows: [{ id: 'run-race', status: 'queued', stage: 'queued', provider: 'deepseek', model: 'deepseek-chat', created_at: '2026-06-18T10:00:00.000Z' }] },
  ])

  const result = await submitAgentMessage({
    userId: 'user-1',
    threadId: 'thread-1',
    dto: makeDto({
      content: 'hi',
      provider: 'deepseek',
      model: 'deepseek-chat',
      clientRequestId: 'req-' + 'd'.repeat(20),
    }),
    client: client as never,
  })

  assert.equal(result.kind, 'replay')
})