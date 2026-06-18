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

  async findUserMessage(userId: string, messageId: string): Promise<AgentMessage | null> {
    const result = await this.pool.query<AgentMessageRow>(
      `SELECT m.id, m.thread_id, m.user_id, m.role, m.content, m.provider, m.model,
              m.run_id, m.citations, m.metadata, m.created_at
       FROM agent_messages m
       JOIN agent_threads t ON t.id = m.thread_id AND t.user_id = $1
       WHERE m.user_id = $1 AND m.id = $2
       LIMIT 1`,
      [userId, messageId],
    )
    return result.rows[0] ? mapAgentMessageRow(result.rows[0]) : null
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

  async getStockProfile(
    userId: string,
    stockId: string,
  ): Promise<AgentStockProfile | null> {
    const result = await this.pool.query<AgentStockProfileRow>(
      `SELECT code, name, industry, current_price, change_amount, change_percent,
              price_date, open_price, high_price, low_price, pre_close, note
       FROM stocks
       WHERE user_id = $1 AND id = $2
       LIMIT 1`,
      [userId, stockId],
    )
    const row = result.rows[0]
    return row ? mapAgentStockProfileRow(row) : null
  }

  async getPriceHistory(
    userId: string,
    stockId: string,
    limit = 120,
  ): Promise<AgentPriceHistoryRow[]> {
    const safeLimit = Math.max(1, Math.min(120, Math.trunc(limit)))
    const result = await this.pool.query<AgentPriceHistoryRow>(
      `SELECT trade_date, open_price, high_price, low_price, close_price,
              pre_close, change_amount, change_percent, volume, amount
       FROM stock_prices
       WHERE user_id = $1 AND stock_id = $2
       ORDER BY trade_date DESC
       LIMIT $3`,
      [userId, stockId, safeLimit],
    )
    return result.rows
  }

  async getStockNotes(
    userId: string,
    stockId: string,
    limit = 50,
    maxContentLength = 4000,
  ): Promise<AgentStockNoteRow[]> {
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit)))
    const result = await this.pool.query<AgentStockNoteRow>(
      `SELECT id, title, direction, entry_price, target_price, stop_loss,
              tags, content, created_at
       FROM notes
       WHERE user_id = $1 AND stock_id = $2
       ORDER BY created_at DESC, id DESC
       LIMIT $3`,
      [userId, stockId, safeLimit],
    )
    return result.rows.map((row) => truncateNoteContent(row, maxContentLength))
  }

  async getDailyBriefs(
    userId: string,
    stockId: string,
    limit = 7,
  ): Promise<AgentDailyBriefRow[]> {
    const safeLimit = Math.max(1, Math.min(7, Math.trunc(limit)))
    const result = await this.pool.query<AgentDailyBriefRow>(
      `SELECT id, trade_date, signal, action, technical_analysis, logic_judgment,
              price_at_brief, stop_loss_triggered, created_at
       FROM stock_briefs
       WHERE user_id = $1 AND stock_id = $2
       ORDER BY trade_date DESC, created_at DESC
       LIMIT $3`,
      [userId, stockId, safeLimit],
    )
    return result.rows
  }
}

interface AgentStockProfileRow {
  code: string
  name: string
  industry: string | null
  current_price: string | null
  change_amount: string | null
  change_percent: string | null
  price_date: string | null
  open_price: string | null
  high_price: string | null
  low_price: string | null
  pre_close: string | null
  note: string | null
}

interface AgentPriceHistoryRow {
  trade_date: string
  open_price: string | null
  high_price: string | null
  low_price: string | null
  close_price: string | null
  pre_close: string | null
  change_amount: string | null
  change_percent: string | null
  volume: string | null
  amount: string | null
}

interface AgentStockNoteRow {
  id: string
  title: string
  direction: string | null
  entry_price: string | null
  target_price: string | null
  stop_loss: string | null
  tags: string[]
  content: string
  created_at: string
}

interface AgentDailyBriefRow {
  id: string
  trade_date: string
  signal: string
  action: string
  technical_analysis: string
  logic_judgment: string
  price_at_brief: string | null
  stop_loss_triggered: boolean
  created_at: string
}

interface AgentStockProfile {
  code: string
  name: string
  industry: string | null
  currentPrice: string | null
  changeAmount: string | null
  changePercent: string | null
  priceDate: string | null
  openPrice: string | null
  highPrice: string | null
  lowPrice: string | null
  preClose: string | null
  note: string | null
}

function mapAgentStockProfileRow(row: AgentStockProfileRow): AgentStockProfile {
  return {
    code: row.code,
    name: row.name,
    industry: row.industry,
    currentPrice: row.current_price,
    changeAmount: row.change_amount,
    changePercent: row.change_percent,
    priceDate: row.price_date,
    openPrice: row.open_price,
    highPrice: row.high_price,
    lowPrice: row.low_price,
    preClose: row.pre_close,
    note: row.note,
  }
}

function truncateNoteContent(row: AgentStockNoteRow, maxLength: number): AgentStockNoteRow {
  if (row.content.length <= maxLength) return row
  return { ...row, content: row.content.slice(0, maxLength) }
}
