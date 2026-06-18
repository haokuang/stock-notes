import assert from 'node:assert/strict'
import test from 'node:test'
import { mapAgentMessageRow, mapAgentRunRow, parseCitations } from './agent.mapper'

test('maps a stored run into the camelCase domain contract', () => {
  const run = mapAgentRunRow({
    id: 'run-1',
    thread_id: 'thread-1',
    user_id: '00000000-0000-0000-0000-000000000001',
    user_message_id: 'message-1',
    client_request_id: 'request-1',
    provider: 'minimax',
    model: 'MiniMax-M2.5',
    credential_mode: 'coding_plan',
    status: 'failed',
    stage: 'failed',
    attempt_count: 1,
    max_attempts: 2,
    locked_at: null,
    locked_by: null,
    started_at: '2026-06-18T10:00:00.000Z',
    completed_at: '2026-06-18T10:00:03.000Z',
    error_code: 'PROVIDER_RATE_LIMITED',
    error_message: '请求过于频繁',
    retry_after: 30,
    created_at: '2026-06-18T10:00:00.000Z',
    updated_at: '2026-06-18T10:00:03.000Z',
  })

  assert.equal(run.threadId, 'thread-1')
  assert.equal(run.userMessageId, 'message-1')
  assert.equal(run.clientRequestId, 'request-1')
  assert.equal(run.credentialMode, 'coding_plan')
  assert.equal(run.retryAfter, 30)
  assert.equal(run.completedAt, '2026-06-18T10:00:03.000Z')
})

test('maps verified citations from a stored message', () => {
  const message = mapAgentMessageRow({
    id: 'message-2',
    thread_id: 'thread-1',
    user_id: '00000000-0000-0000-0000-000000000001',
    role: 'assistant',
    content: '回答',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    run_id: 'run-1',
    citations: [{
      id: 'news-1',
      title: '公告',
      url: 'https://example.org/news/1',
      source: 'example.org',
      snippet: '摘要',
      publishedAt: '2026-06-18T09:00:00.000Z',
    }],
    metadata: { responseId: 'response-1' },
    created_at: '2026-06-18T10:00:03.000Z',
  })

  assert.equal(message.threadId, 'thread-1')
  assert.equal(message.citations[0].publishedAt, '2026-06-18T09:00:00.000Z')
  assert.deepEqual(message.metadata, { responseId: 'response-1' })
})

test('rejects a stored citation without a URL', () => {
  assert.throws(
    () => parseCitations([{ id: 'news-1', title: '公告' }]),
    /Invalid stored citation/,
  )
})
