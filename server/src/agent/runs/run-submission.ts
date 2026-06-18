import { ConflictException, NotFoundException } from '@nestjs/common'
import type { PoolClient } from 'pg'
import { SubmitAgentMessageDto } from '../agent.dto'

export type SubmissionOutcome =
  | { kind: 'inserted'; message: { id: string; threadId: string }; run: SubmissionRunSummary }
  | { kind: 'replay'; message: { id: string; threadId: string }; run: SubmissionRunSummary }

export interface SubmissionRunSummary {
  id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  stage: 'queued' | 'loading_context' | 'calling_tools' | 'searching' | 'generating' | 'completed' | 'failed'
  provider: string
  model: string
  createdAt: string
}

export interface SubmitAgentMessageInput {
  userId: string
  threadId: string
  dto: SubmitAgentMessageDto
  client: PoolClient
}

interface ThreadRow {
  id: string
  user_id: string
  stock_id: string
  title: string
}

interface ExistingRunRow {
  id: string
  status: SubmissionRunSummary['status']
  stage: SubmissionRunSummary['stage']
  provider: string
  model: string
  created_at: string
}

interface InsertedRunRow {
  id: string
  created_at: string
}

export class AgentActiveRunError extends ConflictException {
  constructor(public readonly activeRun: SubmissionRunSummary) {
    super({ code: 'AGENT_ACTIVE_RUN', activeRun })
  }
}

export async function submitAgentMessage(input: SubmitAgentMessageInput): Promise<SubmissionOutcome> {
  const { userId, threadId, dto, client } = input
  const trimmed = dto.content.trim()
  if (trimmed.length === 0) throw new NotFoundException('资源不存在')
  if (trimmed.length > 12_000) throw new NotFoundException('资源不存在')
  if (!isSafeRequestId(dto.clientRequestId)) throw new NotFoundException('资源不存在')

  await client.query('BEGIN')
  let committed = false
  try {
    const threadResult = await client.query<ThreadRow>(
      `SELECT id, user_id, stock_id, title FROM agent_threads WHERE user_id = $1 AND id = $2 FOR UPDATE`,
      [userId, threadId],
    )
    const thread = threadResult.rows[0]
    if (!thread) {
      await client.query('ROLLBACK')
      throw new NotFoundException('资源不存在')
    }

    const existing = await client.query<ExistingRunRow>(
      `SELECT id, status, stage, provider, model, created_at
       FROM agent_runs
       WHERE user_id = $1 AND client_request_id = $2
       LIMIT 1`,
      [userId, dto.clientRequestId],
    )
    if (existing.rows[0]) {
      const run = existing.rows[0]
      await client.query('COMMIT')
      committed = true
      return {
        kind: 'replay',
        message: { id: '', threadId: thread.id },
        run: summarizeRun(run),
      }
    }

    const activeResult = await client.query<ExistingRunRow>(
      `SELECT id, status, stage, provider, model, created_at
       FROM agent_runs
       WHERE thread_id = $1 AND status IN ('queued', 'running')
       FOR UPDATE`,
      [thread.id],
    )
    if (activeResult.rows[0]) {
      await client.query('ROLLBACK')
      throw new AgentActiveRunError(summarizeRun(activeResult.rows[0]))
    }

    let insertedMessageId: string
    try {
      const messageResult = await client.query<{ id: string }>(
        `INSERT INTO agent_messages (thread_id, user_id, role, content, metadata)
         VALUES ($1, $2, 'user', $3, jsonb_build_object('clientRequestId', $4::text))
         RETURNING id`,
        [thread.id, userId, trimmed, dto.clientRequestId],
      )
      const messageId = messageResult.rows[0]?.id
      if (!messageId) throw new Error('Failed to insert user message')
      insertedMessageId = messageId

      const runResult = await client.query<InsertedRunRow>(
        `INSERT INTO agent_runs
          (thread_id, user_id, user_message_id, client_request_id, provider, model,
           status, stage, attempt_count, max_attempts)
         VALUES ($1, $2, $3, $4, $5, $6, 'queued', 'queued', 0, 2)
         RETURNING id, created_at`,
        [thread.id, userId, messageId, dto.clientRequestId, dto.provider, dto.model],
      )
      const inserted = runResult.rows[0]
      if (!inserted) throw new Error('Failed to insert run')
      await client.query('COMMIT')
      committed = true
      return {
        kind: 'inserted',
        message: { id: messageId, threadId: thread.id },
        run: {
          id: inserted.id,
          status: 'queued',
          stage: 'queued',
          provider: dto.provider,
          model: dto.model,
          createdAt: inserted.created_at,
        },
      }
    } catch (cause) {
      if (!committed) await client.query('ROLLBACK')
      const code = (cause as { code?: string }).code
      if (code === '23505') {
        return replayAfterRace(input)
      }
      throw cause
    }
  } finally {
    if (!committed) {
      try {
        await client.query('ROLLBACK')
      } catch {
        // already rolled back
      }
    }
  }
}

async function replayAfterRace(input: SubmitAgentMessageInput): Promise<SubmissionOutcome> {
  const result = await input.client.query<ExistingRunRow>(
    `SELECT id, status, stage, provider, model, created_at
     FROM agent_runs
     WHERE user_id = $1 AND client_request_id = $2
     LIMIT 1`,
    [input.userId, input.dto.clientRequestId],
  )
  const row = result.rows[0]
  if (!row) {
    throw new NotFoundException('资源不存在')
  }
  return {
    kind: 'replay',
    message: { id: '', threadId: input.threadId },
    run: summarizeRun(row),
  }
}

function summarizeRun(row: ExistingRunRow): SubmissionRunSummary {
  return {
    id: row.id,
    status: row.status,
    stage: row.stage,
    provider: row.provider,
    model: row.model,
    createdAt: row.created_at,
  }
}

function isSafeRequestId(value: string): boolean {
  if (typeof value !== 'string') return false
  if (value.length < 16 || value.length > 100) return false
  return /^[A-Za-z0-9_-]+$/.test(value)
}