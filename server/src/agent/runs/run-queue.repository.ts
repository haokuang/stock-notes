import type { AgentCitation, AgentProvider, AgentRun } from '../agent.types'

export interface ClaimedRun {
  id: string
  userId: string
  threadId: string
  stockId: string
  userMessageId: string
  provider: AgentProvider
  model: string
  attemptCount: number
  maxAttempts: number
}

interface QueueClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>
  release?(): void
}

export interface AgentRunQueueRepositoryOptions {
  clientFactory?: () => QueueClient | Promise<QueueClient>
  now?: () => Date
  leaseMs?: number
}

const DEFAULT_LEASE_MS = 45_000

export class AgentRunQueueRepository {
  private readonly clientFactory: () => QueueClient | Promise<QueueClient>
  private readonly leaseMs: number

  constructor(options: AgentRunQueueRepositoryOptions = {}) {
    this.clientFactory = options.clientFactory ?? (() => ({ query: async () => ({ rows: [] }) }))
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
  }

  async claim({ workerId, limit }: { workerId: string; limit: number }): Promise<ClaimedRun[]> {
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)))
    const client = await this.clientFactory()
    await client.query('BEGIN')
    let committed = false
    try {
      const result = await client.query(
        `SELECT r.id, r.user_id, r.thread_id, t.stock_id, r.user_message_id,
                r.provider, r.model, r.attempt_count, r.max_attempts
         FROM agent_runs r
         JOIN agent_threads t ON t.id = r.thread_id AND t.user_id = r.user_id
         WHERE r.status = 'queued'
         ORDER BY r.created_at, r.id
         FOR UPDATE SKIP LOCKED
         LIMIT $1`,
        [safeLimit],
      )
      const selected = result.rows as Array<Record<string, unknown>>
      if (selected.length === 0) {
        await client.query('COMMIT')
        committed = true
        return []
      }
      const ids = selected.map((row) => String(row.id))
      const updated = await client.query(
        `UPDATE agent_runs
         SET status = 'running',
             stage = 'loading_context',
             locked_at = NOW(),
             locked_by = $2,
             attempt_count = attempt_count + 1,
             started_at = COALESCE(started_at, NOW()),
             updated_at = NOW()
         WHERE id = ANY($1::text[])
         RETURNING id, user_id, thread_id, user_message_id, provider, model,
                   attempt_count, max_attempts`,
        [ids, workerId],
      )
      const stockByRun = new Map(selected.map((row) => [String(row.id), String(row.stock_id)]))
      const runs = (updated.rows as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        userId: String(row.user_id),
        threadId: String(row.thread_id),
        stockId: stockByRun.get(String(row.id)) ?? '',
        userMessageId: String(row.user_message_id),
        provider: row.provider as AgentProvider,
        model: String(row.model),
        attemptCount: Number(row.attempt_count),
        maxAttempts: Number(row.max_attempts),
      }))
      await client.query('COMMIT')
      committed = true
      return runs
    } finally {
      if (!committed) await client.query('ROLLBACK')
      client.release?.()
    }
  }

  async heartbeat({ runId, workerId }: { runId: string; workerId: string }): Promise<void> {
    const client = await this.clientFactory()
    try {
      await client.query(
        `UPDATE agent_runs
         SET locked_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'running' AND locked_by = $2`,
        [runId, workerId],
      )
    } finally {
      client.release?.()
    }
  }

  async markRetryable({
    runId,
    workerId,
  }: {
    runId: string
    workerId: string
    errorCode: string
    errorMessage: string | null
  }): Promise<void> {
    const client = await this.clientFactory()
    try {
      await client.query(
      `UPDATE agent_runs
       SET status = 'queued',
           stage = 'queued',
           locked_at = NULL,
           locked_by = NULL,
           error_code = NULL,
           error_message = NULL,
           retry_after = NULL,
           updated_at = NOW()
       WHERE id = $1 AND status = 'running' AND locked_by = $2`,
        [runId, workerId],
      )
    } finally {
      client.release?.()
    }
  }

  async markFailed({
    runId,
    workerId,
    errorCode,
    errorMessage,
    retryAfter,
  }: {
    runId: string
    workerId: string
    errorCode: string
    errorMessage: string | null
    retryAfter?: number | null
  }): Promise<void> {
    const client = await this.clientFactory()
    try {
      await client.query(
      `UPDATE agent_runs
       SET status = 'failed',
           stage = 'failed',
           locked_at = NULL,
           locked_by = NULL,
           error_code = $3,
           error_message = $4,
           retry_after = $5,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND status = 'running' AND locked_by = $2`,
        [runId, workerId, errorCode, errorMessage, retryAfter ?? null],
      )
    } finally {
      client.release?.()
    }
  }

  async scanExpiredLeases({ leaseMs }: { leaseMs?: number } = {}): Promise<string[]> {
    const ms = leaseMs ?? this.leaseMs
    const client = await this.clientFactory()
    try {
      const result = await client.query(
      `SELECT id FROM agent_runs
       WHERE status = 'running'
         AND locked_by IS NOT NULL
         AND NOW() - locked_at > INTERVAL '${ms} milliseconds'`,
      [],
    )
      return (result.rows as Array<{ id: string }>).map((row) => row.id)
    } finally {
      client.release?.()
    }
  }

  async recoverExpiredRun({
    runId,
    leaseMs,
  }: {
    runId: string
    leaseMs?: number
  }): Promise<'queued' | 'failed' | null> {
    const client = await this.clientFactory()
    const ms = leaseMs ?? this.leaseMs
    try {
      const result = await client.query(
        `UPDATE agent_runs
         SET status = CASE WHEN attempt_count >= max_attempts THEN 'failed' ELSE 'queued' END,
             stage = CASE WHEN attempt_count >= max_attempts THEN 'failed' ELSE 'queued' END,
             locked_at = NULL,
             locked_by = NULL,
             error_code = CASE WHEN attempt_count >= max_attempts THEN 'AGENT_WORKER_LOST' ELSE NULL END,
             error_message = CASE WHEN attempt_count >= max_attempts THEN '任务执行中断，请重试' ELSE NULL END,
             completed_at = CASE WHEN attempt_count >= max_attempts THEN NOW() ELSE NULL END,
             updated_at = NOW()
         WHERE id = $1
           AND status = 'running'
           AND locked_at < NOW() - ($2 * INTERVAL '1 millisecond')
         RETURNING status`,
        [runId, ms],
      )
      const status = (result.rows[0] as { status?: string } | undefined)?.status
      return status === 'queued' || status === 'failed' ? status : null
    } finally {
      client.release?.()
    }
  }

  async finalizeSuccess(input: {
    runId: string
    workerId: string
    userId: string
    threadId: string
    content: string
    model: string
    provider: AgentProvider
    citations: AgentCitation[]
    providerMetadata: Record<string, unknown>
  }): Promise<{ messageId: string }> {
    const client = await this.clientFactory()
    await client.query('BEGIN')
    let committed = false
    try {
      const messageResult = await client.query(
        `INSERT INTO agent_messages
          (thread_id, user_id, run_id, role, content, provider, model, citations, metadata)
         VALUES ($1, $2, $3, 'assistant', $4, $5, $6, $7::jsonb, $8::jsonb)
         RETURNING id`,
        [
          input.threadId,
          input.userId,
          input.runId,
          input.content,
          input.provider,
          input.model,
          JSON.stringify(input.citations),
          JSON.stringify(input.providerMetadata ?? {}),
        ],
      )
      const messageId = (messageResult.rows[0] as { id?: string } | undefined)?.id
      if (!messageId) throw new Error('Failed to insert assistant message')
      await client.query(
        `UPDATE agent_tool_calls
         SET status = 'completed', completed_at = COALESCE(completed_at, NOW())
         WHERE run_id = $1 AND status = 'running'`,
        [input.runId],
      )
      const update = await client.query(
        `UPDATE agent_runs
         SET status = 'completed',
             stage = 'completed',
             locked_at = NULL,
             locked_by = NULL,
             completed_at = NOW(),
             updated_at = NOW()
         WHERE id = $1 AND status = 'running' AND locked_by = $2
         RETURNING id`,
        [input.runId, input.workerId],
      )
      if (!update.rows[0]) {
        throw new Error('Run not owned by worker or already finalized')
      }
      await client.query('COMMIT')
      committed = true
      return { messageId }
    } finally {
      if (!committed) {
        try {
          await client.query('ROLLBACK')
        } catch {
          // already rolled back
        }
      }
      client.release?.()
    }
  }
}

export type { AgentRun }
