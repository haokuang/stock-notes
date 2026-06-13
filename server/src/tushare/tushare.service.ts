import { Injectable, Logger } from '@nestjs/common'

const TUSHARE_API = 'https://api.tushare.pro'

export interface StockBasic {
  ts_code: string
  symbol: string
  name: string
  industry: string
  market: string
  list_date?: string
}

export interface DailyQuote {
  ts_code: string
  trade_date: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  pre_close: number | null
  change: number | null
  pct_chg: number | null
  vol: number | null
  amount: number | null
}

interface TushareResponse<T = unknown> {
  code: number
  msg: string | null
  data?: {
    fields: string[]
    items: Array<Array<unknown>>
    has_more?: boolean
  }
}

/**
 * Tushare HTTP 客户端
 * 仅做最薄一层包装：POST JSON，3s 超时，结构化返回 fields/items。
 */
@Injectable()
export class TushareService {
  private readonly logger = new Logger(TushareService.name)

  /** 任意 Tushare 接口调用 */
  async request<T = Record<string, unknown>>(
    api_name: string,
    params: Record<string, unknown> = {},
    fields?: string,
  ): Promise<Array<Record<string, unknown>>> {
    const token = process.env.TUSHARE_TOKEN
    if (!token) {
      this.logger.warn('TUSHARE_TOKEN 未配置')
      return []
    }
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      const res = await fetch(TUSHARE_API, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_name,
          token,
          params,
          fields,
        }),
      })
      clearTimeout(timeout)
      if (!res.ok) {
        this.logger.warn(`Tushare ${api_name} HTTP ${res.status}`)
        return []
      }
      const json = (await res.json()) as TushareResponse<T>
      if (json.code !== 0) {
        this.logger.warn(`Tushare ${api_name} err: ${json.msg}`)
        return []
      }
      if (!json.data?.fields || !json.data?.items) return []
      return json.data.items.map((row) => {
        const obj: Record<string, unknown> = {}
        json.data!.fields.forEach((f, i) => (obj[f] = row[i]))
        return obj
      })
    } catch (err) {
      this.logger.warn(`Tushare ${api_name} 异常: ${(err as Error).message}`)
      return []
    }
  }

  /** 股票基础信息（用于添加自选股时自动补全 industry/market） */
  async getStockBasic(ts_code: string): Promise<StockBasic | null> {
    const rows = await this.request<StockBasic>(
      'stock_basic',
      { ts_code },
      'ts_code,symbol,name,industry,market,list_date',
    )
    if (!rows.length) return null
    const r = rows[0]
    return {
      ts_code: String(r.ts_code ?? ''),
      symbol: String(r.symbol ?? ''),
      name: String(r.name ?? ''),
      industry: String(r.industry ?? ''),
      market: String(r.market ?? 'CN'),
      list_date: r.list_date ? String(r.list_date) : undefined,
    }
  }

  /** 拉取最近 N 天的日线（默认 5 天），用于同步最新行情 */
  async getDaily(ts_code: string, days = 5): Promise<DailyQuote[]> {
    const end = new Date()
    const start = new Date()
    start.setDate(end.getDate() - days)
    const start_str = start.toISOString().slice(0, 10).replace(/-/g, '')
    const end_str = end.toISOString().slice(0, 10).replace(/-/g, '')

    const rows = await this.request<DailyQuote>(
      'daily',
      { ts_code, start_date: start_str, end_date: end_str },
    )
    return rows
      .map((r) => ({
        ts_code: String(r.ts_code ?? ts_code),
        trade_date: String(r.trade_date ?? ''),
        open: r.open != null ? Number(r.open) : null,
        high: r.high != null ? Number(r.high) : null,
        low: r.low != null ? Number(r.low) : null,
        close: r.close != null ? Number(r.close) : null,
        pre_close: r.pre_close != null ? Number(r.pre_close) : null,
        change: r.change != null ? Number(r.change) : null,
        pct_chg: r.pct_chg != null ? Number(r.pct_chg) : null,
        vol: r.vol != null ? Number(r.vol) : null,
        amount: r.amount != null ? Number(r.amount) : null,
      }))
      .filter((q) => q.trade_date)
  }

  /** 仅取最近一个交易日的报价（拉 1 天数据取最新一条） */
  async getLatestQuote(ts_code: string): Promise<DailyQuote | null> {
    const list = await this.getDaily(ts_code, 5)
    if (!list.length) return null
    return list.sort((a, b) => b.trade_date.localeCompare(a.trade_date))[0]
  }
}
