import { Inject, Injectable } from '@nestjs/common'
import type { Pool } from 'pg'
import { PG_POOL } from '../storage/database/database.module'
import {
  mapAgentMessageRow,
  mapAgentReportSummaryRow,
  mapAgentRunRow,
  mapAgentThreadRow,
} from './agent.mapper'
import type {
  AgentMessage,
  AgentMessageRow,
  AgentReportSummary,
  AgentReportSummaryRow,
  AgentRun,
  AgentRunRow,
  AgentThread,
  AgentThreadRow,
  MessagePage,
} from './agent.types'

interface MessageCursor {
  createdAt: string
  id: string
}

function encodeCursor(cursor: MessageCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

function decodeCursor(value: string): MessageCursor {
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<MessageCursor>
    if (typeof cursor.createdAt !== 'string' || typeof cursor.id !== 'string') throw new Error()
    return { createdAt: cursor.createdAt, id: cursor.id }
  } catch {
    throw new Error('Invalid message cursor')
  }
}

@Injectable()
export class AgentRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async getOrCreateThread(userId: string, stockId: string): Promise<AgentThread> {
    const result = await this.pool.query<AgentThreadRow>(
      `INSERT INTO agent_threads (user_id, stock_id, title)
       SELECT $1, id, name FROM stocks
       WHERE id = $2 AND user_id = $1
       ON CONFLICT (user_id, stock_id)
       DO UPDATE SET updated_at = agent_threads.updated_at
       RETURNING id, user_id, stock_id, title, created_at, updated_at`,
      [userId, stockId],
    )
    if (!result.rows[0]) throw new Error('Stock not found')
    return mapAgentThreadRow(result.rows[0])
  }

  async findThread(userId: string, threadId: string): Promise<AgentThread | null> {
    const result = await this.pool.query<AgentThreadRow>(
      `SELECT id, user_id, stock_id, title, created_at, updated_at
       FROM agent_threads WHERE user_id = $1 AND id = $2 LIMIT 1`,
      [userId, threadId],
    )
    return result.rows[0] ? mapAgentThreadRow(result.rows[0]) : null
  }

  async findThreadByStock(userId: string, stockId: string): Promise<AgentThread | null> {
    const result = await this.pool.query<AgentThreadRow>(
      `SELECT id, user_id, stock_id, title, created_at, updated_at
       FROM agent_threads WHERE user_id = $1 AND stock_id = $2 LIMIT 1`,
      [userId, stockId],
    )
    return result.rows[0] ? mapAgentThreadRow(result.rows[0]) : null
  }

  async listMessages(
    userId: string,
    threadId: string,
    cursor: string | null,
    limit: number,
  ): Promise<MessagePage<AgentMessage>> {
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)))
    const values: unknown[] = [userId, threadId]
    let cursorClause = ''
    if (cursor) {
      const decoded = decodeCursor(cursor)
      values.push(decoded.createdAt, decoded.id)
      cursorClause = 'AND (m.created_at, m.id) < ($3, $4)'
    }
    values.push(safeLimit + 1)
    const limitParameter = values.length
    const result = await this.pool.query<AgentMessageRow>(
      `SELECT m.id, m.thread_id, m.user_id, m.role, m.content, m.provider, m.model,
              m.run_id, m.citations, m.metadata, m.created_at
       FROM agent_messages m
       JOIN agent_threads t ON t.id = m.thread_id AND t.user_id = $1
       WHERE m.user_id = $1 AND m.thread_id = $2 ${cursorClause}
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT $${limitParameter}`,
      values,
    )
    const hasMore = result.rows.length > safeLimit
    const selected = result.rows.slice(0, safeLimit)
    const oldest = selected.at(-1)
    return {
      items: selected.map(mapAgentMessageRow).reverse(),
      nextCursor: hasMore && oldest
        ? encodeCursor({ createdAt: oldest.created_at, id: oldest.id })
        : null,
    }
  }

  async findRun(userId: string, runId: string): Promise<AgentRun | null> {
    const result = await this.pool.query<AgentRunRow>(
      `SELECT id, thread_id, user_id, user_message_id, client_request_id, provider, model,
              credential_mode, status, stage, attempt_count, max_attempts, locked_at,
              locked_by, started_at, completed_at, error_code, error_message, retry_after,
              created_at, updated_at
       FROM agent_runs WHERE user_id = $1 AND id = $2 LIMIT 1`,
      [userId, runId],
    )
    return result.rows[0] ? mapAgentRunRow(result.rows[0]) : null
  }

  async listReports(userId: string, stockId: string): Promise<AgentReportSummary[]> {
    const result = await this.pool.query<AgentReportSummaryRow>(
      `SELECT id, stock_id, stock_code, stock_name, title, status, agent_run_id, created_at
       FROM ai_reports
       WHERE user_id = $1 AND stock_id = $2 AND agent_run_id IS NOT NULL
       ORDER BY created_at DESC, id DESC`,
      [userId, stockId],
    )
    return result.rows.map(mapAgentReportSummaryRow)
  }
}
