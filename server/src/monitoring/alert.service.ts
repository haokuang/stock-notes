import { Inject, Injectable, Logger } from '@nestjs/common'
import { DRIZZLE_DB, PG_POOL } from '../storage/database/database.module'
import * as schema from '../storage/database/shared/schema'
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

export interface AlertInput {
  level?: 'error' | 'warn' | 'critical'
  source: string                       // 'http' | 'cron-sync' | 'cron-brief' | 'manual'
  message: string
  stack?: string
  context?: Record<string, unknown>
  userId?: string
  /** false = 只落库不邮件(高频噪音)。默认 true(发邮件) */
  sendEmail?: boolean
}

/**
 * 错误监控 + 告警服务
 * - log(): 落库 + 可选 Resend 邮件
 * - 失败兜底:邮件/库都失败时只 console.error,不抛(避免二次故障)
 */
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name)
  private readonly resendApiKey = process.env.RESEND_API_KEY
  private readonly alertEmail = process.env.ALERT_EMAIL
  private readonly fromEmail = process.env.ALERT_FROM_EMAIL || 'alerts@stock-notes.local'

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async log(input: AlertInput): Promise<void> {
    const level = input.level ?? 'error'
    const sendEmail = input.sendEmail !== false
    let insertedId: string | null = null
    let notified = false

    // 1. 落库(用 raw query 走 ON CONFLICT 无所谓的简单 insert)
    try {
      const client = await this.pool.connect()
      try {
        const r = await client.query<{ id: string }>(
          `INSERT INTO error_logs (level, source, message, stack, context, user_id)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING id`,
          [
            level,
            input.source,
            input.message,
            input.stack ?? null,
            JSON.stringify(input.context ?? {}),
            input.userId ?? null,
          ],
        )
        insertedId = r.rows[0]?.id ?? null
      } finally {
        client.release()
      }
    } catch (e) {
      this.logger.error(`[alert] 落库失败: ${(e as Error).message}`, (e as Error).stack)
    }

    // 2. 邮件告警
    if (sendEmail && this.resendApiKey && this.alertEmail) {
      try {
        await this.sendResendEmail({
          to: this.alertEmail,
          from: this.fromEmail,
          subject: `[${level.toUpperCase()}] ${input.source}: ${input.message.slice(0, 80)}`,
          text: this.formatEmailBody(input),
        })
        notified = true
      } catch (e) {
        this.logger.error(`[alert] 邮件发送失败: ${(e as Error).message}`)
      }
    } else if (sendEmail) {
      // 没配 RESEND_API_KEY 时降级到 console(开发环境)
      this.logger.warn(
        `[alert:no-email-config] ${level}/${input.source} - ${input.message}\n` +
          `  stack: ${input.stack?.split('\n').slice(0, 3).join(' | ')}\n` +
          `  context: ${JSON.stringify(input.context ?? {}).slice(0, 200)}`,
      )
    }

    // 3. 标记 notified
    if (insertedId && notified) {
      try {
        const client = await this.pool.connect()
        try {
          await client.query("UPDATE error_logs SET notified = 't' WHERE id = $1", [insertedId])
        } finally {
          client.release()
        }
      } catch {
        // 静默
      }
    }
  }

  private formatEmailBody(input: AlertInput): string {
    const lines = [
      `Level:   ${input.level ?? 'error'}`,
      `Source:  ${input.source}`,
      `Time:    ${new Date().toISOString()}`,
      `User:    ${input.userId ?? '(system)'}`,
      ``,
      `Message:`,
      input.message,
      ``,
    ]
    if (input.stack) {
      lines.push('Stack:', input.stack, '')
    }
    if (input.context && Object.keys(input.context).length) {
      lines.push('Context:', JSON.stringify(input.context, null, 2))
    }
    return lines.join('\n')
  }

  private async sendResendEmail(args: { to: string; from: string; subject: string; text: string }) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Resend HTTP ${res.status}: ${body.slice(0, 200)}`)
    }
  }
}
