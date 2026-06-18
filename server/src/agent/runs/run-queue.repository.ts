import type { AgentCitation, AgentProvider, AgentRun } from '../agent.types'

export interface ClaimedRun {
  id: string
  userId: string
  threadId: string
  userMessageId: string
  provider: AgentProvider
  model: string
  attemptCount: number
  maxAttempts: number
}

interface QueueClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>
}

export interface AgentRunQueueRepositoryOptions {
  clientFactory?: () => QueueClient
  now?: () => Date
  leaseMs?: number
}

const DEFAULT_LEASE_MS = 45_000

export class AgentRunQueueRepository {
  private readonly clientFactory: () => QueueClient
  private readonly leaseMs: number

  constructor(options: AgentRunQueueRepositoryOptions = {}) {
    this.clientFactory = options.clientFactory ?? (() => ({ query: async () => ({ rows: [] }) }))
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS
  }

  async claim({ workerId, limit }: { workerId: string; limit: number }): Promise<ClaimedRun[]> {
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)))
    const client = this.clientFactory()
    const result = await client.query(
      `SELECT id, user_id, thread_id, user_message_id, provider, model, attempt_count, max_attempts
       FROM agent_runs
       WHERE status = 'queued'
       ORDER BY created_at, id
       FOR UPDATE SKIP LOCKED
       LIMIT $1`,
      [safeLimit],
    )
    const rows = result.rows as ClaimedRun[]
    if (rows.length === 0) return []
    const ids = rows.map((row) => row.id)
    await client.query(
      `UPDATE agent_runs
       SET status = 'running',
           stage = 'loading_context',
           locked_at = NOW(),
           locked_by = $2,
           attempt_count = attempt_count + 1,
           started_at = COALESCE(started_at, NOW()),
           updated_at = NOW()
       WHERE id = ANY($1::text[])`,
      [ids, workerId],
    )
    return rows
  }

  async heartbeat({ runId, workerId }: { runId: string; workerId: string }): Promise<void> {
    const client = this.clientFactory()
    await client.query(
      `UPDATE agent_runs
       SET updated_at = NOW()
       WHERE id = $1 AND status = 'running' AND locked_by = $2`,
      [runId, workerId],
    )
  }

  async markRetryable({
    runId,
    workerId,
    errorCode,
    errorMessage,
  }: {
    runId: string
    workerId: string
    errorCode: string
    errorMessage: string | null
  }): Promise<void> {
    const client = this.clientFactory()
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
      [runId, workerId, errorCode, errorMessage],
    )
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
    const client = this.clientFactory()
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
  }

  async scanExpiredLeases({ leaseMs }: { leaseMs?: number } = {}): Promise<string[]> {
    const ms = leaseMs ?? this.leaseMs
    const client = this.clientFactory()
    const result = await client.query(
      `SELECT id FROM agent_runs
       WHERE status = 'running'
         AND locked_by IS NOT NULL
         AND NOW() - locked_at > INTERVAL '${ms} milliseconds'`,
      [],
    )
    return (result.rows as Array<{ id: string }>).map((row) => row.id)
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
    const client = this.clientFactory()
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
    }
  }
}

export type { AgentRun }