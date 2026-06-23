import { Inject, Injectable, NotFoundException, ConflictException, BadRequestException, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { DRIZZLE_DB, PG_POOL } from '../storage/database/database.module';
import * as schema from '../storage/database/shared/schema';
import { desc, eq, asc, sql, like, or, and } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { BuyStockDto, CreateStockDto, SellStockDto, UpdateStockDto } from './dto';
import { TushareService } from '../tushare/tushare.service';
import {
  buyStockTransaction,
  sellStockTransaction,
  TradeStateError,
} from './trade-persistence';
import { assertEquitySubject, MARKET_SUBJECT } from './stock-subject';

/**
 * 服务端价格刷新限频:1 分钟 / 股
 * 防止前端狂点 / 分布式多端同时刷新打爆东方财富
 */
const REFRESH_COOLDOWN_MS = 60_000
const _refreshLocks = new Map<string, number>()  // key = `${uid}:${stockId}` → 下次允许时间戳(ms)

@Injectable()
export class StocksService {
  private readonly logger = new Logger(StocksService.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: NodePgDatabase<typeof schema>,
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly tushare: TushareService,
  ) {}

  async list(uid: string, keyword?: string) {
    const baseWhere = eq(schema.stocks.user_id, uid)
    const rows = keyword?.trim()
      ? await this.db
          .select()
          .from(schema.stocks)
          .where(
            and(
              baseWhere,
              or(
                like(schema.stocks.code, `%${keyword.trim()}%`),
                like(schema.stocks.name, `%${keyword.trim()}%`),
              ),
            ),
          )
          .orderBy(asc(schema.stocks.sort_order), desc(schema.stocks.created_at))
      : await this.db
          .select()
          .from(schema.stocks)
          .where(baseWhere)
          .orderBy(asc(schema.stocks.sort_order), desc(schema.stocks.created_at))
    // 给每只 holding 的股票附带 stop_loss alert(用于首页小红点)
    // 同时附上 price_time / is_realtime 派生字段
    return rows.map((r) => {
      const alert = r.status === 'holding' ? this.calcStopLossRaw(r) : null
      return { ...this.attachPriceTime(r), stop_loss_alert: alert }
    })
  }

  private calcStopLossRaw(stock: any): {
    status: 'ok' | 'warning' | 'danger' | 'triggered'
    actual_rate: number
    threshold: number
  } | null {
    const entryPrice = Number(stock.entry_price ?? 0)
    const lossRate = Number(stock.loss_rate ?? 0)
    const currentPrice = Number(stock.current_price ?? 0)
    if (entryPrice <= 0 || lossRate <= 0) return null
    const actualRate = ((entryPrice - currentPrice) / entryPrice) * 100
    let status: 'ok' | 'warning' | 'danger' | 'triggered'
    if (actualRate < lossRate * 0.5) status = 'ok'
    else if (actualRate < lossRate * 0.8) status = 'warning'
    else if (actualRate < lossRate) status = 'danger'
    else status = 'triggered'
    return { status, actual_rate: Number(actualRate.toFixed(2)), threshold: lossRate }
  }

  async getById(uid: string, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.stocks)
      .where(and(eq(schema.stocks.id, id), eq(schema.stocks.user_id, uid)))
      .limit(1)
    if (!row) throw new NotFoundException(`股票 ${id} 不存在`)
    return this.attachPriceTime(row)
  }

  /**
   * 给 stock 行附上 price_time / is_realtime 派生字段
   * - price_date 缺失 → price_time = null
   * - 否则取 price_date 15:00 作为价格时间
   * - is_realtime 恒为 false(stocks 表快照没有日内时间精度)
   * - 实际日内时间由 /refresh-price 接口返回
   */
  private attachPriceTime<T extends { price_date?: string | null; last_sync_at?: string | Date | null }>(row: T) {
    if (!row.price_date) return { ...row, price_time: null, price_time_label: null, is_realtime: false }
    const date = row.price_date
    const ymd = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)} 15:00`
    const info = this.formatPriceTime(ymd)
    return { ...row, price_time: info.iso, price_time_label: info.label, is_realtime: false }
  }

  async getByCode(uid: string, code: string) {
    const [row] = await this.db
      .select()
      .from(schema.stocks)
      .where(and(eq(schema.stocks.code, code), eq(schema.stocks.user_id, uid)))
      .limit(1)
    if (!row) throw new NotFoundException(`股票 ${code} 不存在`)
    return row
  }

  async searchMarket(keyword: string, limit = 20) {
    const normalized = keyword.trim()
    if (!normalized) return []
    return this.tushare.searchListedOrdinaryStocks(normalized, limit)
  }

  async createMarket(uid: string) {
    const existing = await this.db
      .select({ id: schema.stocks.id })
      .from(schema.stocks)
      .where(and(eq(schema.stocks.user_id, uid), eq(schema.stocks.code, MARKET_SUBJECT.code)))
      .limit(1)
    if (existing.length) throw new ConflictException('市场大盘已在自选中')

    try {
      const [row] = await this.db
        .insert(schema.stocks)
        .values({
          user_id: uid,
          code: MARKET_SUBJECT.code,
          name: MARKET_SUBJECT.name,
          subject_type: MARKET_SUBJECT.subjectType,
          industry: null,
          status: 'watching',
          sort_order: 0,
        })
        .returning()
      return row
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('市场大盘已在自选中')
      }
      throw error
    }
  }

  async assertEquityOperation(uid: string, stockId: string) {
    const stock = await this.getById(uid, stockId)
    assertEquitySubject(stock)
    return stock
  }

  async create(uid: string, dto: CreateStockDto) {
    const code = dto.code.trim()
    const existing = await this.db
      .select({ id: schema.stocks.id })
      .from(schema.stocks)
      .where(and(eq(schema.stocks.user_id, uid), eq(schema.stocks.code, code)))
      .limit(1)
    if (existing.length) throw new ConflictException(`股票 ${code} 已在自选股中`)

    const basic = await this.tushare.getListedOrdinaryStock(code)
    if (!basic) {
      throw new BadRequestException('仅支持沪深北已上市的 A 股普通股票')
    }

    let row: schema.Stock
    try {
      [row] = await this.db
        .insert(schema.stocks)
        .values({
          user_id: uid,
          code: basic.code,
          name: basic.name,
          subject_type: 'stock',
          industry: basic.industry || null,
          sort_order: dto.sortOrder ?? 0,
        })
        .returning()
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException(`股票 ${code} 已在自选股中`)
      }
      throw error
    }

    // 创建后立即拉一次价格(2026-06-14)— 避免"加了不刷就没数据"的 bug
    // 失败不阻塞,继续返回 row(让用户能看到已加入;前端在详情页仍可手动刷)
    try {
      await this.refreshPrice(uid, row.id)
    } catch (e) {
      this.logger.warn(`[create] 自动拉价失败 ${code}: ${(e as Error).message}`)
    }

    return row
  }

  async update(uid: string, id: string, dto: UpdateStockDto) {
    const existing = await this.getById(uid, id)
    const [row] = await this.db
      .update(schema.stocks)
      .set({
        name: dto.name ?? existing.name,
        industry: dto.industry ?? existing.industry,
        current_price: dto.currentPrice != null ? String(dto.currentPrice) : existing.current_price,
        change_amount: dto.changeAmount != null ? String(dto.changeAmount) : existing.change_amount,
        change_percent: dto.changePct != null ? String(dto.changePct) : existing.change_percent,
        sort_order: dto.sortOrder ?? existing.sort_order,
        updated_at: new Date(),
      })
      .where(and(eq(schema.stocks.id, id), eq(schema.stocks.user_id, uid)))
      .returning()
    return row
  }

  async remove(uid: string, id: string) {
    await this.getById(uid, id)
    await this.db
      .delete(schema.stocks)
      .where(and(eq(schema.stocks.id, id), eq(schema.stocks.user_id, uid)))
    return { id, deleted: true }
  }

  async summary(uid: string) {
    const client = await this.pool.connect()
    try {
      return await fetchSummary(client, uid)
    } finally {
      client.release()
    }
  }

  /**
   * 买入:watching → holding
   * - 写入 entry_price / loss_rate / status='holding' / entered_at
   * - 同时落一条 note 记录 buy_reason(tags=['buy']),direction='bull'
   */
  async buy(uid: string, id: string, dto: BuyStockDto) {
    await this.assertEquityOperation(uid, id)
    const client = await this.pool.connect()
    try {
      return await buyStockTransaction(client, {
        userId: uid,
        stockId: id,
        entryPrice: dto.entryPrice,
        lossRate: dto.lossRate,
        buyReason: dto.buyReason,
      })
    } catch (error) {
      if (error instanceof TradeStateError) {
        if (error.code === 'not_found') throw new NotFoundException(`股票 ${id} 不存在`)
        if (error.code === 'already_holding') {
          throw new ConflictException('股票已在持有状态,如需重新设置请先卖出')
        }
      }
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * 卖出:holding → watching
   * - 清三件套
   * - 落一条 note 记录卖出理由(direction='bear', tags=['sell', 'exit'])
   */
  async sell(uid: string, id: string, dto: SellStockDto) {
    await this.assertEquityOperation(uid, id)
    const client = await this.pool.connect()
    try {
      return await sellStockTransaction(client, {
        userId: uid,
        stockId: id,
        exitReason: dto.exitReason,
      })
    } catch (error) {
      if (error instanceof TradeStateError) {
        if (error.code === 'not_found') throw new NotFoundException(`股票 ${id} 不存在`)
        if (error.code === 'not_holding') {
          throw new BadRequestException('股票不在持有状态,无法卖出')
        }
      }
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * 止损提醒 — 基于 loss_rate 阈值
   * 状态:ok(<50%) / warning(50-80%) / danger(80-100%) / triggered(≥100%)
   */
  async getStopLossAlert(uid: string, id: string) {
    const [stock] = await this.db
      .select()
      .from(schema.stocks)
      .where(and(eq(schema.stocks.id, id), eq(schema.stocks.user_id, uid)))
      .limit(1)
    if (!stock) throw new NotFoundException(`股票 ${id} 不存在`)
    assertEquitySubject(stock)
    if (stock.status !== 'holding') {
      return {
        status: 'inactive' as const,
        actual_rate: 0,
        threshold: null,
        distance_to_trigger: null,
        message: '股票不在持有状态',
      }
    }

    const entryPrice = Number(stock.entry_price ?? 0)
    const lossRate = Number(stock.loss_rate ?? 0)
    const currentPrice = Number(stock.current_price ?? 0)
    if (entryPrice <= 0 || lossRate <= 0) {
      return {
        status: 'inactive' as const,
        actual_rate: 0,
        threshold: lossRate,
        distance_to_trigger: null,
        message: '三件套不完整',
      }
    }

    // 盈利时 actual_rate 为负
    const actualRate = ((entryPrice - currentPrice) / entryPrice) * 100
    const distanceToTrigger = lossRate - actualRate  // 正数 = 离止损还有空间
    let status: 'ok' | 'warning' | 'danger' | 'triggered'
    if (actualRate < lossRate * 0.5) status = 'ok'
    else if (actualRate < lossRate * 0.8) status = 'warning'
    else if (actualRate < lossRate) status = 'danger'
    else status = 'triggered'

    return {
      status,
      actual_rate: Number(actualRate.toFixed(2)),
      threshold: lossRate,
      distance_to_trigger: Number(distanceToTrigger.toFixed(2)),
      entry_price: entryPrice,
      current_price: currentPrice,
      message:
        status === 'triggered'
          ? `已触及止损线(实际亏损 ${actualRate.toFixed(2)}% ≥ ${lossRate}%)`
          : status === 'danger'
            ? `接近止损线(实际亏损 ${actualRate.toFixed(2)}% / 上限 ${lossRate}%)`
            : status === 'warning'
              ? `注意:实际亏损 ${actualRate.toFixed(2)}% / 上限 ${lossRate}%`
              : `安全:实际亏损 ${actualRate.toFixed(2)}% / 上限 ${lossRate}%`,
    }
  }

  private toTushareCode(code: string): string {
    const c = code.trim().toUpperCase();
    if (c.includes('.')) return c;
    if (/^(6|9|5|1)/.test(c)) return `${c}.SH`;
    if (/^(0|3|2)/.test(c)) return `${c}.SZ`;
    if (/^(4|8)/.test(c)) return `${c}.BJ`;
    return `${c}.SZ`;
  }

  /**
   * 手动刷新股票实时价格(调东方财富)
   * - 数据源:东方财富 push2(优先)→ Tushare daily(兜底)→ 旧快照(再兜底)
   * - 限频:同一 uid + 同一 stockId,1 分钟内只允许 1 次(服务端 in-memory token bucket)
   * - 返回:{ price, change, changePercent, high, low, open, volume, source, syncedAt, cooldown_remaining_sec }
   *   或 HttpException 429 + Retry-After(秒)若冷却中
   */
  async refreshPrice(uid: string, stockId: string) {
    // 0. 限频检查
    const lockKey = `${uid}:${stockId}`
    const now = Date.now()
    const next = _refreshLocks.get(lockKey) ?? 0
    if (now < next) {
      const cooldownSec = Math.ceil((next - now) / 1000)
      throw new HttpException(
        { message: `1 分钟内只能刷新 1 次,请 ${cooldownSec} 秒后再试`, cooldown_remaining_sec: cooldownSec },
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    // 1. 校验所有权
    const [stock] = await this.db
      .select()
      .from(schema.stocks)
      .where(and(eq(schema.stocks.id, stockId), eq(schema.stocks.user_id, uid)))
      .limit(1)
    if (!stock) throw new NotFoundException(`股票 ${stockId} 不存在`)
    assertEquitySubject(stock)

    const tsCode = this.toTushareCode(stock.code)

    // 2. 优先调腾讯 qt.gtimg.cn
    let quote = await this.tushare.getRealtimeQuote(stock.code)
    let source: 'tencent' | 'tushare' | 'cache' = 'tencent'
    if (!quote) {
      this.logger.warn(`[refresh] 腾讯 ${stock.code} 失败,降级到 Tushare`)
      const tushareList = await this.tushare.getDaily(tsCode, 5)
      if (tushareList.length) {
        const last = tushareList.sort((a, b) => b.trade_date.localeCompare(a.trade_date))[0]
        quote = last
        source = 'tushare'
      } else if (stock.current_price != null) {
        // 最终兜底:返回旧快照
        _refreshLocks.set(lockKey, now + REFRESH_COOLDOWN_MS)  // 也设冷却避免刷出风暴
        const fallbackTime = stock.last_sync_at
          ? this.formatPriceTime(
              new Date(stock.last_sync_at as unknown as string).toISOString().slice(0, 16).replace('T', ' '),
            )
          : null
        return {
          price: Number(stock.current_price),
          change: stock.change_amount != null ? Number(stock.change_amount) : null,
          changePercent: stock.change_percent != null ? Number(stock.change_percent) : null,
          high: stock.high_price != null ? Number(stock.high_price) : null,
          low: stock.low_price != null ? Number(stock.low_price) : null,
          open: stock.open_price != null ? Number(stock.open_price) : null,
          volume: null,
          price_time: fallbackTime?.iso ?? null,
          price_time_label: fallbackTime?.label ?? null,
          is_realtime: false,
          source: 'cache' as const,
          syncedAt: new Date().toISOString(),
          cooldown_remaining_sec: 60,
        }
      } else {
        throw new BadRequestException('行情数据不可用,请稍后重试')
      }
    }

    // 3. upsert stock_prices(按 (user_id, stock_id, trade_date))
    if (quote.trade_date) {
      // 直接用 pg client.query 绕开 Drizzle 的 prepared-stmt 错误吞掉问题
      const client = await this.pool.connect()
      try {
        await client.query(
          `INSERT INTO stock_prices (user_id, stock_id, trade_date, open_price, high_price, low_price, close_price, pre_close, change_amount, change_percent, volume)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (user_id, stock_id, trade_date) DO UPDATE SET
             open_price = EXCLUDED.open_price,
             high_price = EXCLUDED.high_price,
             low_price = EXCLUDED.low_price,
             close_price = EXCLUDED.close_price,
             pre_close = EXCLUDED.pre_close,
             change_amount = EXCLUDED.change_amount,
             change_percent = EXCLUDED.change_percent,
             volume = EXCLUDED.volume`,
          [
            uid,
            stockId,
            quote.trade_date,
            quote.open?.toFixed(2) ?? null,
            quote.high?.toFixed(2) ?? null,
            quote.low?.toFixed(2) ?? null,
            quote.close?.toFixed(2) ?? null,
            quote.pre_close?.toFixed(2) ?? null,
            quote.change?.toFixed(2) ?? null,
            quote.pct_chg?.toFixed(2) ?? null,
            quote.vol != null ? String(Math.round(quote.vol)) : null,
          ],
        )
      } finally {
        client.release()
      }
    }

    // 4. 更新 stocks 表快照
    await this.db
      .update(schema.stocks)
      .set({
        current_price: quote.close != null ? quote.close.toFixed(2) : null,
        change_amount: quote.change != null ? quote.change.toFixed(2) : null,
        change_percent: quote.pct_chg != null ? quote.pct_chg.toFixed(2) : null,
        open_price: quote.open != null ? quote.open.toFixed(2) : null,
        high_price: quote.high != null ? quote.high.toFixed(2) : null,
        low_price: quote.low != null ? quote.low.toFixed(2) : null,
        pre_close: quote.pre_close != null ? quote.pre_close.toFixed(2) : null,
        volume: quote.vol != null ? String(Math.round(quote.vol)) : null,
        amount: quote.amount != null ? quote.amount.toFixed(2) : null,
        price_date: quote.trade_date,
        last_sync_at: new Date(),
        updated_at: new Date(),
      })
      .where(and(eq(schema.stocks.id, stockId), eq(schema.stocks.user_id, uid)))

    // 5. 设冷却
    _refreshLocks.set(lockKey, now + REFRESH_COOLDOWN_MS)

    // 6. 构造价格时间字段
    // - 腾讯(实时):quote_time 是 yyyyMMddHHmmss,转 YYYY-MM-DD HH:mm
    // - Tushare(昨日收盘):trade_date 是 yyyyMMdd,补 15:00
    const isRealtime = source === 'tencent' && !!quote.quote_time
    const timeInfo = isRealtime && quote.quote_time
      ? this.formatPriceTime(this.yymmddToIso(quote.quote_time))
      : this.formatPriceTime(`${quote.trade_date.slice(0, 4)}-${quote.trade_date.slice(4, 6)}-${quote.trade_date.slice(6, 8)} 15:00`)

    return {
      price: quote.close,
      change: quote.change,
      changePercent: quote.pct_chg,
      high: quote.high,
      low: quote.low,
      open: quote.open,
      volume: quote.vol,
      price_time: timeInfo.iso,
      price_time_label: timeInfo.label,
      is_realtime: isRealtime,
      source,
      syncedAt: new Date().toISOString(),
      cooldown_remaining_sec: 60,
    }
  }

  /**
   * 把 "YYYY-MM-DD HH:mm" 转成 {iso, label}
   * - iso: "2026-06-14 14:30" (后端传给前端用)
   * - label:
   *     - 今天   + 有日内时间 → "今日 HH:mm"
   *     - 今天   + 仅 15:00    → "今日收盘"
   *     - 昨天                   → "昨日收盘"
   *     - 同年内                → "MM-DD"
   *     - 跨年                   → "YYYY-MM-DD"
   */
  private formatPriceTime(iso: string): { iso: string; label: string } {
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/)
    if (!m) return { iso, label: iso }
    const [, y, mo, d, hh, mm] = m
    const now = new Date()
    const beijingNow = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60_000)
    const today = `${beijingNow.getFullYear()}-${String(beijingNow.getMonth() + 1).padStart(2, '0')}-${String(beijingNow.getDate()).padStart(2, '0')}`
    const date = `${y}-${mo}-${d}`
    const isToday = date === today
    const timeOfDay = `${hh}:${mm}`
    let label: string
    if (isToday) {
      label = timeOfDay === '15:00' ? '今日收盘' : `今日 ${timeOfDay}`
    } else {
      const yesterday = new Date(beijingNow)
      yesterday.setDate(beijingNow.getDate() - 1)
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
      label = date === yesterdayStr ? '昨日收盘' : (y === String(beijingNow.getFullYear()) ? `${mo}-${d}` : `${y}-${mo}-${d}`)
    }
    return { iso, label }
  }

  private yymmddToIso(s: string): string {
    if (s.length < 12) return s
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}`
  }

  /** 读 stock 详情端点直接覆盖了 stocks.current_price;为兼容老 client,这里再暴露一个 fallback */
  async getRefreshStatus(uid: string, stockId: string) {
    await this.assertEquityOperation(uid, stockId)
    const lockKey = `${uid}:${stockId}`
    const next = _refreshLocks.get(lockKey) ?? 0
    const remaining = Math.max(0, Math.ceil((next - Date.now()) / 1000))
    return { cooldown_remaining_sec: remaining, can_refresh: remaining === 0 }
  }
}

export interface StockSummary {
  stocks: number
  notes: number
  reports: number
  bull: number
}

/**
 * 首页/个人页汇总统计:stocks / notes / ai_reports / bull 观点数
 * 全部用 scalar subquery 合并成一条 SQL,避免 4 次串行 round-trip
 */
export async function fetchSummary(
  client: import('pg').PoolClient,
  uid: string,
): Promise<StockSummary> {
  const { rows } = await client.query<{
    stocks: number
    notes: number
    reports: number
    bull: number
  }>(
    `SELECT
       (SELECT count(*)::int FROM stocks WHERE user_id = $1) AS stocks,
       (SELECT count(*)::int FROM notes WHERE user_id = $1) AS notes,
       (SELECT count(*)::int FROM ai_reports WHERE user_id = $1) AS reports,
       (SELECT count(*)::int FROM notes
         WHERE user_id = $1 AND direction = 'bull' AND type = 'note') AS bull`,
    [uid],
  )
  const r = rows[0]
  return {
    stocks: r?.stocks ?? 0,
    notes: r?.notes ?? 0,
    reports: r?.reports ?? 0,
    bull: r?.bull ?? 0,
  }
}
