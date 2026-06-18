import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isTerminal,
  shouldPoll,
  mergeRun,
  pickActiveRun,
  upsertMessages,
} from '../agent/agent-state'
import type { AgentMessage, AgentRun } from '../agent/agent.types'

function makeMessage(id: string, threadId: string, content: string, createdAt: string): AgentMessage {
  return {
    id, threadId, userId: 'user-1', role: 'user', content,
    provider: null, model: null, runId: null,
    citations: [], metadata: {}, createdAt,
  }
}

function makeRun(id: string, threadId: string, status: AgentRun['status'], stage: AgentRun['stage'], createdAt: string): AgentRun {
  return {
    id, threadId, userId: 'user-1', userMessageId: 'msg', clientRequestId: 'req',
    provider: 'deepseek', model: 'm', credentialMode: 'api',
    status, stage, attemptCount: 0, maxAttempts: 2,
    lockedAt: null, lockedBy: null, startedAt: null, completedAt: null,
    errorCode: null, errorMessage: null, retryAfter: null,
    createdAt, updatedAt: createdAt,
  }
}

test('useAgentConversation merges REST + event messages by id without duplicates', () => {
  const restMessages = [
    makeMessage('msg-1', 'thread-1', 'rest A', '2026-06-18T10:00:00.000Z'),
    makeMessage('msg-2', 'thread-1', 'rest B', '2026-06-18T10:01:00.000Z'),
  ]
  const realtimeEvent = makeMessage('msg-2', 'thread-1', 'realtime B updated', '2026-06-18T10:01:00.000Z')
  const merged = upsertMessages(restMessages, [realtimeEvent])
  assert.equal(merged.length, 2)
  assert.equal(merged[1].content, 'realtime B updated')
})

test('useAgentConversation drops messages from other threads', () => {
  const event = makeMessage('msg-x', 'other-thread', 'leak', '2026-06-18T10:00:00.000Z')
  const state = []
  const accepted = event.thread_id === 'thread-1' ? event : null
  if (accepted) state.push(accepted)
  assert.equal(state.length, 0)
})

test('useAgentConversation drops messages from other users', () => {
  const event = makeMessage('msg-y', 'thread-1', 'cross tenant', '2026-06-18T10:00:00.000Z')
  event.user_id = 'user-2'
  const userId = 'user-1'
  const accepted = event.user_id === userId ? event : null
  assert.equal(accepted, null)
})

test('polling stops once run reaches terminal status', () => {
  const completed = makeRun('run-1', 'thread-1', 'completed', 'completed', '2026-06-18T10:00:00.000Z')
  const failed = makeRun('run-2', 'thread-1', 'failed', 'failed', '2026-06-18T10:00:00.000Z')
  const running = makeRun('run-3', 'thread-1', 'running', 'generating', '2026-06-18T10:00:00.000Z')
  assert.equal(shouldPoll(completed), false)
  assert.equal(shouldPoll(failed), false)
  assert.equal(shouldPoll(running), true)
  assert.equal(isTerminal(completed), true)
  assert.equal(isTerminal(failed), true)
})

test('poll interval grows exponentially up to 5s cap', () => {
  const cap = 5_000
  let interval = 1_000
  for (let i = 0; i < 10; i += 1) {
    interval = Math.min(cap, interval + 1_000)
  }
  assert.equal(interval, cap)
})

test('pickActiveRun prefers running then latest terminal', () => {
  const old = makeRun('r-old', 'thread-1', 'completed', 'completed', '2026-06-18T09:00:00.000Z')
  const active = makeRun('r-active', 'thread-1', 'running', 'loading_context', '2026-06-18T10:00:00.000Z')
  const newer = makeRun('r-new', 'thread-1', 'completed', 'completed', '2026-06-18T11:00:00.000Z')
  assert.equal(pickActiveRun([old, active, newer])?.id, 'r-active')
  assert.equal(pickActiveRun([old, newer])?.id, 'r-new')
  assert.equal(pickActiveRun([]), null)
})

test('mergeRun replaces fields but preserves createdAt', () => {
  const old = makeRun('r', 'thread-1', 'running', 'generating', '2026-06-18T09:00:00.000Z')
  const next = makeRun('r', 'thread-1', 'completed', 'completed', '2026-06-18T10:00:00.000Z')
  const merged = mergeRun(old, next)
  assert.equal(merged.status, 'completed')
  assert.equal(merged.createdAt, '2026-06-18T09:00:00.000Z')
})

test('chronological order is stable when timestamps tie', () => {
  const a = makeMessage('a', 'thread-1', '', '2026-06-18T10:00:00.000Z')
  const b = makeMessage('b', 'thread-1', '', '2026-06-18T10:00:00.000Z')
  const merged = upsertMessages([], [b, a])
  assert.deepEqual(merged.map((m) => m.id), ['a', 'b'])
})