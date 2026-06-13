import { Inject, Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { DRIZZLE_DB } from '../storage/database/database.module'
import * as schema from '../storage/database/shared/schema'
import { eq, sql } from 'drizzle-orm'
import { TushareService } from '../tushare/tushare.service'

/**
 * 每日行情同步
 * - cron：每个交易日 15:35（北京时间，A股收盘 15:00 之后）拉取所有自选股最新日线
 * - syncAll() / syncOne(id)：手动触发，供前端按钮调用
 */
@Injectable()
export class DailySyncService {
  private readonly logger = new Logger(DailySyncService.name)

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: any,
    private readonly tushare: TushareService,
  ) {}

  /** 每日 15:35 自动同步所有自选股最近一个交易日的行情 */
  @Cron('35 15 * * 1-5', { timeZone: 'Asia/Shanghai' })
  async cronSync() {
    this.logger.log('[cron] 每日 15:35 启动行情同步')
    const result = await this.syncAll()
    this.logger.log(`[cron] 同步完成：成功 ${result.success} / 失败 ${result.failed}`)
  }

  /** 同步所有自选股 */
  async syncAll(): Promise<{ success: number; failed: number; skipped: number }> {
    const list: Array<{ id: string; code: string; name: string }> = await this.db
      .select({ id: schema.stocks.id, code: schema.stocks.code, name: schema.stocks.name })
      .from(schema.stocks)

    let success = 0
    let failed = 0
    let skipped = 0
    for (const s of list) {
      try {
        const ts_code = this.toTushareCode(s.code)
        const r = await this.syncOne(s.id, ts_code)
        if (r === 'ok') success++
        else if (r === 'skipped') skipped++
        else failed++
      } catch (err) {
        failed++
        this.logger.warn(`同步 ${s.code} 失败: ${(err as Error).message}`)
      }
    }
    return { success, failed, skipped }
  }

  /** 同步单只：返回 'ok' | 'skipped' | 'error' */
  async syncOne(stockId: string, tsCode: string): Promise<'ok' | 'skipped' | 'error'> {
    const quotes = await this.tushare.getDaily(tsCode, 5)
    if (!quotes.length) return 'skipped'

    // 写入历史表 stock_prices（upsert by (stock_id, trade_date)）
    for (const q of quotes) {
      await this.db
        .insert(schema.stockPrices)
        .values({
          stock_id: stockId,
          trade_date: q.trade_date,
          open_price: q.open != null ? q.open.toFixed(2) : null,
          high_price: q.high != null ? q.high.toFixed(2) : null,
          low_price: q.low != null ? q.low.toFixed(2) : null,
          close_price: q.close != null ? q.close.toFixed(2) : null,
          pre_close: q.pre_close != null ? q.pre_close.toFixed(2) : null,
          change_amount: q.change != null ? q.change.toFixed(2) : null,
          change_percent: q.pct_chg != null ? q.pct_chg.toFixed(2) : null,
          volume: q.vol != null ? String(Math.round(q.vol)) : null,
          amount: q.amount != null ? q.amount.toFixed(2) : null,
        })
        .onConflictDoUpdate({
          target: [schema.stockPrices.stock_id, schema.stockPrices.trade_date],
          set: {
            open_price: sql`excluded.open_price`,
            high_price: sql`excluded.high_price`,
            low_price: sql`excluded.low_price`,
            close_price: sql`excluded.close_price`,
            pre_close: sql`excluded.pre_close`,
            change_amount: sql`excluded.change_amount`,
            change_percent: sql`excluded.change_percent`,
            volume: sql`excluded.volume`,
            amount: sql`excluded.amount`,
          },
        })
    }

    // 取最新一条，更新到 stocks 表快照字段
    const latest = quotes.sort((a, b) => b.trade_date.localeCompare(a.trade_date))[0]
    await this.db
      .update(schema.stocks)
      .set({
        current_price: latest.close != null ? latest.close.toFixed(2) : null,
        change_amount: latest.change != null ? latest.change.toFixed(2) : null,
        change_percent: latest.pct_chg != null ? latest.pct_chg.toFixed(2) : null,
        price_date: latest.trade_date,
        open_price: latest.open != null ? latest.open.toFixed(2) : null,
        high_price: latest.high != null ? latest.high.toFixed(2) : null,
        low_price: latest.low != null ? latest.low.toFixed(2) : null,
        pre_close: latest.pre_close != null ? latest.pre_close.toFixed(2) : null,
        volume: latest.vol != null ? String(Math.round(latest.vol)) : null,
        amount: latest.amount != null ? latest.amount.toFixed(2) : null,
        last_sync_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(schema.stocks.id, stockId))
    return 'ok'
  }

  /** 取单只股票最近 N 天的日线历史 */
  async getHistory(stockId: string, days = 30) {
    const rows = await this.db
      .select()
      .from(schema.stockPrices)
      .where(eq(schema.stockPrices.stock_id, stockId))
      .orderBy(sql`trade_date DESC`)
      .limit(days)
    return rows
  }

  /**
   * 把用户输入的 6 位代码补全成 Tushare 格式
   */
  private toTushareCode(code: string): string {
    const c = code.trim().toUpperCase()
    if (c.includes('.')) return c
    if (/^(6|9|5|1)/.test(c)) return `${c}.SH`
    if (/^(0|3|2)/.test(c)) return `${c}.SZ`
    if (/^(4|8)/.test(c)) return `${c}.BJ`
    return `${c}.SZ`
  }
}
