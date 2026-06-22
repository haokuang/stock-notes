import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { eq, desc, and } from 'drizzle-orm'
import { DRIZZLE_DB, PG_POOL } from '../storage/database/database.module'
import * as schema from '../storage/database/shared/schema'
import { Pool } from 'pg'
import { deepseekChat, DEEPSEEK_FLASH_MODEL, DEEPSEEK_PRO_MODEL } from './deepseek.client'
import {
  persistDailyBriefArtifacts,
  type StockBriefRow,
} from './daily-brief-persistence'
import { TushareService } from '../tushare/tushare.service'
import { ensurePriceHistory } from '../stocks/price-history'
import { assertEquitySubject } from '../stocks/stock-subject'

const { stocks, notes, stockBriefs } = schema

/**
 * 每日简评 · 2026-06-14 重构
 *
 * MVP 简化为:
 *   - 单段 100 字左右简评(自然语言,中文)
 *   - LLM 同步判色:green / yellow / red
 *   - 落 stock_briefs 表(信号缓存,详情页时间线用)
 *   - 同时落一条 doc 笔记(进笔记库,跟手写笔记同源)
 *   - 每个用户、股票、交易日只保留 1 条，重复生成覆盖更新
 *
 * 强制规则:若 actual_loss_rate >= loss_rate → 强制 signal='red',content 写"触及止损"
 */

const BRIEF_TARGET_LEN = 100

type LLMOutput = {
  signal: 'green' | 'yellow' | 'red'
  content: string
}

@Injectable()
export class DailyBriefService {
  private readonly logger = new Logger(DailyBriefService.name)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: any,
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly tushare: TushareService,
  ) {}

  // ============ 公开 API ============

  /**
   * 生成简评(uid 隔离)— 主入口
   * 1. 拉股票 + 历史 + 近期观点
   * 2. 本地算技术指标 + 强止损覆盖
   * 3. LLM 生成 100 字简评 + 信号色
   * 4. 落 stock_briefs
   * 5. 落一条 doc 笔记到 notes 表
   */
  async generateBrief(
    uid: string,
    stockId: string,
  ): Promise<{
    brief: StockBriefRow
    usedLLM: boolean
    noteId: string | null
    historySampleSize: number
    historyBackfilled: boolean
  }> {
    // 1. 取股票
    const [stock] = await this.db
      .select()
      .from(stocks)
      .where(and(eq(stocks.id, stockId), eq(stocks.user_id, uid)))
      .limit(1)
    if (!stock) throw new NotFoundException(`股票 ${stockId} 不存在`)
    assertEquitySubject(stock)

    // 2. 近 60 个交易日；数据库不足时先从 Tushare 补齐再重读
    const historyClient = await this.pool.connect()
    let historyState: Awaited<ReturnType<typeof ensurePriceHistory>>
    try {
      historyState = await ensurePriceHistory(historyClient, {
        userId: uid,
        stockId,
        tsCode: this.toTushareCode(stock.code),
        fetchQuotes: (tsCode, days) => this.tushare.getDaily(tsCode, days),
      })
    } finally {
      historyClient.release()
    }
    const history = historyState.history
    if (historyState.backfilled) {
      this.logger.log(
        `[brief] 已补齐历史行情 stock=${stock.code},样本=${historyState.sampleSize}`,
      )
    }

    // 3. 近期观点(摘要给 LLM)
    const recentNotes = await this.db
      .select({
        id: notes.id,
        title: notes.title,
        direction: notes.direction,
        content: notes.content,
        tags: notes.tags,
        created_at: notes.created_at,
      })
      .from(notes)
      .where(and(eq(notes.stock_id, stockId), eq(notes.user_id, uid)))
      .orderBy(desc(notes.created_at))
      .limit(10)

    // 4. 本地技术指标 + 止损检查
    const indicators = this.calcIndicators(history, stock.current_price)
    const stopLoss = this.calcStopLoss(stock)

    // 5. 交易日作为幂等键的一部分
    const today = new Date()
    const tradeDate = stock.price_date ?? today.toISOString().slice(0, 10).replace(/-/g, '')

    // 6. 生成简评内容(强止损覆盖 → 走本地;否则 LLM)
    let signal: 'green' | 'yellow' | 'red' = 'green'
    let content = ''
    let usedLLM = false
    let stopLossTriggered = false

    if (stopLoss.status === 'triggered') {
      // 强止损:不调 LLM,固定文案
      signal = 'red'
      content = `触及止损线(实际亏损 ${stopLoss.actual_rate.toFixed(2)}% ≥ 上限 ${stopLoss.threshold}%)。已构成原买入逻辑的实质性失效,建议重新评估或执行卖出。`
      stopLossTriggered = true
    } else if (stock.status === 'watching') {
      // 观察中:不调 LLM,技术摘要 100 字
      signal = 'green'
      content = `观察中。基于 ${historyState.sampleSize} 个交易日样本，MA20=${indicators.ma20},RSI14=${indicators.rsi14},量比=${indicators.volRatio}。技术面尚无明确方向,维持观察。`
    } else {
      // holding + 非止损触发:调 LLM
      const buyReasonText = recentNotes.find((n) => Array.isArray(n.tags) && n.tags.includes('buy'))?.content ?? '(无明确买入理由)'

      const prompt = `你是 A 股投资助手。基于以下数据,用一段 100 字左右的中文自然语言,给出今日简评。同时给一个信号色:green(乐观) / yellow(中性谨慎) / red(警惕)。

【股票】${stock.name}(${stock.code}),行业:${stock.industry ?? '未知'}
【状态】${stock.status} | 买入价 ¥${stock.entry_price} | 亏损率上限 ${stock.loss_rate}%
【买入理由】${buyReasonText}
【历史观点】${recentNotes.map((n) => `[${n.direction}] ${n.title}`).join(' | ').slice(0, 400) || '(暂无)'}
【技术指标样本】${historyState.sampleSize} 个交易日${historyState.sampleSize < 60 ? '(样本不足 60 日，谨慎解读)' : ''}
【技术指标】MA5=${indicators.ma5} MA20=${indicators.ma20} MA60=${indicators.ma60} | MACD:DIF=${indicators.macd.dif} DEA=${indicators.macd.dea} 柱=${indicators.macd.hist} | RSI14=${indicators.rsi14} | 布林:${indicators.boll.lower}-${indicators.boll.upper} | 量比=${indicators.volRatio}
【今日行情】最新价 ¥${stock.current_price ?? '—'} 涨跌 ${stock.change_percent ?? '—'}%
【止损状态】${stopLoss.message}

判色参考:
- green:技术面偏多(MA5>MA20、RSI 50-70、量比>1),买入逻辑仍成立
- yellow:技术面中性或信号矛盾,继续观察
- red:技术面破位(跌破 MA20、RSI>80 超买或<20 超卖、量比>2 放量滞涨),或触及止损

输出严格 JSON(无 markdown):
{
  "content": "100 字左右简评,自然语言,不分行,不空泛",
  "signal": "green" | "yellow" | "red"
}`

      try {
        const responseContent = await deepseekChat(
          [
            { role: 'system', content: '你是 A 股投资助手,只输出严格 JSON,不输出 markdown。' },
            { role: 'user', content: prompt },
          ],
          { model: DEEPSEEK_PRO_MODEL, temperature: 0.4 },
        )
        const text = responseContent
        const json = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '')
        const parsed = JSON.parse(json) as LLMOutput
        content = String(parsed.content ?? '').slice(0, 500)  // 兜底截断
        signal = ['green', 'yellow', 'red'].includes(parsed.signal) ? parsed.signal : 'yellow'
        usedLLM = true
      } catch (e) {
        this.logger.warn(`[brief] DeepSeek 调用失败,使用本地兜底: ${(e as Error).message}`)
        content = `LLM 不可用,基于本地指标的占位简评。MA20=${indicators.ma20},RSI=${indicators.rsi14},量比=${indicators.volRatio}。`
        signal = stopLoss.status === 'danger' ? 'yellow' : 'green'
      }
    }

    // 7. 原子 upsert 简评与自动笔记
    const contentHtml = `<p>${this.escapeHtml(content)}</p>`
    const client = await this.pool.connect()
    try {
      const persisted = await persistDailyBriefArtifacts(client, {
        userId: uid,
        stockId,
        stockCode: stock.code,
        stockName: stock.name,
        tradeDate,
        signal,
        content,
        contentHtml,
        priceAtBrief: stock.current_price,
        stopLossTriggered,
      })
      return {
        ...persisted,
        usedLLM,
        historySampleSize: historyState.sampleSize,
        historyBackfilled: historyState.backfilled,
      }
    } finally {
      client.release()
    }
  }

  /**
   * 取最近 N 天的 brief(给股票详情页时间线)
   */
  async getRecent(uid: string, stockId: string, days = 7): Promise<StockBriefRow[]> {
    const [stock] = await this.db
      .select({ id: stocks.id, subject_type: stocks.subject_type })
      .from(stocks)
      .where(and(eq(stocks.id, stockId), eq(stocks.user_id, uid)))
      .limit(1)
    if (!stock) throw new NotFoundException(`股票 ${stockId} 不存在`)
    assertEquitySubject(stock)

    const rows = await this.db
      .select()
      .from(stockBriefs)
      .where(and(eq(stockBriefs.stock_id, stockId), eq(stockBriefs.user_id, uid)))
      .orderBy(desc(stockBriefs.trade_date))
      .limit(days)
    return rows as StockBriefRow[]
  }

  /**
   * AI 自动总结标题(标题留空时用)— 2026-06-14
   * 输入:content(已写的详细观点)
   * 输出:≤ 50 字的简洁标题
   *
   * 策略:
   * 1. 优先调 LLM(MiniMax coding plan / 豆包)— 智能总结
   * 2. LLM 失败时降级:取 content 前 30 字 + "..."(零调用)
   *
   * TODO:等用户配 MINIMAX_API_KEY 后,接 MiniMax coding plan API
   *   (https://api.minimax.chat/v1/text/chatcompletion_v2,OpenAI 兼容)
   */
  async summarizeTitle(content: string): Promise<string> {
    const trimmed = (content ?? '').trim()
    if (!trimmed) {
      return ''
    }
    if (trimmed.length <= 50) {
      return trimmed
    }

    // 1. 试调 LLM
    try {
      const content = await deepseekChat(
        [
          {
            role: 'system',
            content: '你是 A 股投研助手,根据用户给的长文,提炼一个不超过 50 字的简洁标题。只输出标题本身,不要任何标点符号、引号或前缀。',
          },
          { role: 'user', content: trimmed.slice(0, 1500) },
        ],
        { model: DEEPSEEK_FLASH_MODEL, temperature: 0.3 },
      )
      const title = content.replace(/[「」"'\n\r]/g, '').slice(0, 50)
      if (title) return title
    } catch (e) {
      this.logger.warn(`[summarizeTitle] DeepSeek 调用失败,降级: ${(e as Error).message}`)
    }

    // 2. 降级:取 content 前 30 字 + "..."
    return trimmed.slice(0, 30) + (trimmed.length > 30 ? '...' : '')
  }

  // ============ 纯本地计算 ============

  /**
   * 止损状态
   */
  private calcStopLoss(stock: any): {
    status: 'inactive' | 'ok' | 'warning' | 'danger' | 'triggered'
    actual_rate: number
    threshold: number | null
    message: string
  } {
    if (stock.status !== 'holding') {
      return { status: 'inactive', actual_rate: 0, threshold: null, message: '股票不在持有状态' }
    }
    const entryPrice = Number(stock.entry_price ?? 0)
    const lossRate = Number(stock.loss_rate ?? 0)
    const currentPrice = Number(stock.current_price ?? 0)
    if (entryPrice <= 0 || lossRate <= 0) {
      return { status: 'inactive', actual_rate: 0, threshold: lossRate, message: '三件套不完整' }
    }
    const actualRate = ((entryPrice - currentPrice) / entryPrice) * 100
    let status: 'ok' | 'warning' | 'danger' | 'triggered'
    let message = ''
    if (actualRate < lossRate * 0.5) {
      status = 'ok'
      message = `安全:实际亏损 ${actualRate.toFixed(2)}% / 上限 ${lossRate}%`
    } else if (actualRate < lossRate * 0.8) {
      status = 'warning'
      message = `注意:实际亏损 ${actualRate.toFixed(2)}% / 上限 ${lossRate}%`
    } else if (actualRate < lossRate) {
      status = 'danger'
      message = `接近止损线(实际 ${actualRate.toFixed(2)}% / 上限 ${lossRate}%)`
    } else {
      status = 'triggered'
      message = `已触及止损线(实际 ${actualRate.toFixed(2)}% ≥ ${lossRate}%)`
    }
    return { status, actual_rate: actualRate, threshold: lossRate, message }
  }

  private calcIndicators(history: any[], currentPrice: string | null): TechnicalIndicators {
    const closes = [...history].reverse().map((h) => Number(h.close_price)).filter((v) => v > 0)
    const volumes = [...history].reverse().map((h) => Number(h.volume ?? 0))
    const lastClose = closes.length > 0 ? closes[closes.length - 1] : Number(currentPrice ?? 0)

    const ma5 = this.sma(closes, 5)
    const ma20 = this.sma(closes, 20)
    const ma60 = this.sma(closes, 60)

    const macd = this.macd(closes, 12, 26, 9)
    const rsi14 = this.rsi(closes, 14)
    const boll = this.bollinger(closes, 20, 2)

    const vol5 = volumes.slice(-5).reduce((s, v) => s + v, 0) / Math.min(5, volumes.length || 1)
    const todayVol = volumes[volumes.length - 1] ?? 0
    const volRatio = vol5 > 0 ? Number((todayVol / vol5).toFixed(2)) : 0

    return {
      ma5: ma5.toFixed(2),
      ma20: ma20.toFixed(2),
      ma60: ma60.toFixed(2),
      macd: { dif: macd.dif.toFixed(2), dea: macd.dea.toFixed(2), hist: macd.hist.toFixed(2) },
      rsi14: rsi14.toFixed(2),
      boll: { upper: boll.upper.toFixed(2), mid: boll.mid.toFixed(2), lower: boll.lower.toFixed(2) },
      volRatio,
      lastClose,
      summary: `MA20=${ma20.toFixed(2)} RSI=${rsi14.toFixed(2)} 布林带 ${boll.lower.toFixed(2)}-${boll.upper.toFixed(2)}`,
    }
  }

  private toTushareCode(code: string): string {
    const normalized = code.trim().toUpperCase()
    if (normalized.includes('.')) return normalized
    if (/^(600|601|603|605|688|689)/.test(normalized)) return `${normalized}.SH`
    if (/^(000|001|002|003|300|301)/.test(normalized)) return `${normalized}.SZ`
    if (/^(4|8|9)/.test(normalized)) return `${normalized}.BJ`
    return normalized
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  private sma(arr: number[], period: number): number {
    if (arr.length === 0) return 0
    if (arr.length < period) return arr.reduce((s, v) => s + v, 0) / arr.length
    return arr.slice(-period).reduce((s, v) => s + v, 0) / period
  }

  private ema(arr: number[], period: number): number[] {
    if (arr.length === 0) return []
    const k = 2 / (period + 1)
    const ema: number[] = []
    arr.forEach((v, i) => {
      if (i === 0) ema.push(v)
      else ema.push(v * k + ema[i - 1] * (1 - k))
    })
    return ema
  }

  private macd(closes: number[], fast = 12, slow = 26, signal = 9) {
    if (closes.length === 0) return { dif: 0, dea: 0, hist: 0 }
    const emaFast = this.ema(closes, fast)
    const emaSlow = this.ema(closes, slow)
    const dif = (emaFast[emaFast.length - 1] ?? 0) - (emaSlow[emaSlow.length - 1] ?? 0)
    const difSeries = emaFast.map((v, i) => v - (emaSlow[i] ?? 0))
    const deaSeries = this.ema(difSeries, signal)
    const dea = deaSeries[deaSeries.length - 1] ?? 0
    const hist = (dif - dea) * 2
    return { dif, dea, hist }
  }

  private rsi(closes: number[], period = 14): number {
    if (closes.length < period + 1) return 50
    let gain = 0
    let loss = 0
    for (let i = closes.length - period; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1]
      if (diff > 0) gain += diff
      else loss -= diff
    }
    const avgGain = gain / period
    const avgLoss = loss / period
    if (avgLoss === 0) return 100
    const rs = avgGain / avgLoss
    return 100 - 100 / (1 + rs)
  }

  private bollinger(closes: number[], period = 20, n = 2) {
    if (closes.length === 0) return { upper: 0, mid: 0, lower: 0 }
    const slice = closes.slice(-period)
    const mid = slice.reduce((s, v) => s + v, 0) / slice.length
    const variance = slice.reduce((s, v) => s + (v - mid) ** 2, 0) / slice.length
    const sigma = Math.sqrt(variance)
    return { upper: mid + n * sigma, mid, lower: mid - n * sigma }
  }
}

// ============ 类型导出 ============

export interface TechnicalIndicators {
  ma5: string
  ma20: string
  ma60: string
  macd: { dif: string; dea: string; hist: string }
  rsi14: string
  boll: { upper: string; mid: string; lower: string }
  volRatio: number
  lastClose: number
  summary: string
}

export type { StockBriefRow } from './daily-brief-persistence'
