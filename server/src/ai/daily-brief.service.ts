import { Injectable, Logger, Inject } from '@nestjs/common'
import { Config, LLMClient, SearchClient } from 'coze-coding-dev-sdk'
import { eq, desc, and, sql } from 'drizzle-orm'
import { DRIZZLE_DB } from '../storage/database/database.module'
import * as schema from '../storage/database/shared/schema'

const { stocks, stockPrices } = schema

/**
 * AI 今日简评
 * 综合 Tushare 价格数据 + 联网搜索最新消息 + 豆包大模型
 * 输出 ≤100 字的表现 / 涨跌原因总结
 */
@Injectable()
export class DailyBriefService {
  private readonly logger = new Logger(DailyBriefService.name)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(@Inject(DRIZZLE_DB) private readonly db: any) {}

  /**
   * 生成某只股票的今日简评
   */
  async generate(stockId: string): Promise<{
    brief: string
    keyPoints: string[]
    priceContext: {
      code: string
      name: string
      changePercent: string
      changeAmount: string
      volume: string
      vs5dAvgVol: string
    }
    newsSummary: string
    mock: boolean
  }> {
    // 1. 取股票基础信息
    const [stock] = await this.db.select().from(stocks).where(eq(stocks.id, stockId)).limit(1)
    if (!stock) {
      throw new Error(`股票不存在: ${stockId}`)
    }

    // 2. 取最近 5 个交易日（含今日）
    const history = await this.db
      .select()
      .from(stockPrices)
      .where(eq(stockPrices.stock_id, stockId))
      .orderBy(desc(stockPrices.trade_date))
      .limit(5)

    // 计算 5 日均量
    const avg5dVol =
      history.length > 0
        ? history.reduce((sum, p) => sum + Number(p.volume ?? 0), 0) / history.length
        : 0
    const todayVol = Number(history[0]?.volume ?? 0)
    const vs5dAvgVol = avg5dVol > 0 ? ((todayVol / avg5dVol - 1) * 100).toFixed(1) : '0.0'

    const priceContext = {
      code: stock.code,
      name: stock.name,
      changePercent: Number(stock.change_percent ?? 0).toFixed(2),
      changeAmount: Number(stock.change_amount ?? 0).toFixed(2),
      volume: todayVol.toLocaleString('zh-CN'),
      vs5dAvgVol: `${Number(vs5dAvgVol) >= 0 ? '+' : ''}${vs5dAvgVol}%`,
    }

    // 3. 联网搜索最新消息
    let newsSummary = ''
    try {
      const search = new SearchClient(new Config())
      const res = await search.advancedSearch(
        `${stock.name} ${stock.code} 今日 行情 涨跌原因`,
        { count: 5, timeRange: '1d', needSummary: true },
      )
      newsSummary = res.summary ?? res.web_items?.slice(0, 3).map((i) => i.snippet).join(' / ') ?? ''
    } catch (e) {
      this.logger.warn(`联网搜索失败，使用空上下文: ${(e as Error).message}`)
      newsSummary = ''
    }

    // 4. 调豆包生成 ≤100 字简评
    const prompt = `你是股票投资助手。请根据以下数据生成一段不超过 100 字的「今日表现 + 涨跌原因」简评，语气专业客观。

【股票】${stock.name}（${stock.code}），行业：${stock.industry ?? '未知'}
【今日行情】最新价 ${stock.current_price} 元，涨跌幅 ${priceContext.changePercent}%，涨跌额 ${priceContext.changeAmount} 元
【量能】今日成交量 ${priceContext.volume}，较 5 日均量 ${priceContext.vs5dAvgVol}
【近 5 日涨跌】${history.map((p) => `${p.trade_date}:${p.change_percent}%`).join(', ')}
【今日消息】${newsSummary || '暂无最新消息'}

输出格式（严格遵守）：
简评：<一句话表现>
要点：<1-2 条核心原因>
字数：简评正文必须 ≤100 字。`

    let brief = ''
    let keyPoints: string[] = []
    let mock = false

    try {
      const llm = new LLMClient(new Config())
      const res = await llm.invoke(
        [
          {
            role: 'system',
            content: '你是 A 股投资助手，输出简洁专业的股票简评。',
          },
          { role: 'user', content: prompt },
        ],
        { model: 'doubao-seed-1-8-251228', temperature: 0.5, thinking: 'disabled' },
      )
      const text = res.content
      // 解析简评与要点
      const briefMatch = text.match(/简评[：:]\s*([\s\S]+?)(?=\n要点|\n*$)/)
      const pointsMatch = text.match(/要点[：:]\s*([\s\S]+)/)
      brief = (briefMatch?.[1] ?? text).trim().slice(0, 200)
      keyPoints = (pointsMatch?.[1] ?? '')
        .split(/\n|;|；|、/)
        .map((s) => s.replace(/^[\s\-•·]+/, '').trim())
        .filter((s) => s.length > 0)
        .slice(0, 3)
    } catch (e) {
      mock = true
      this.logger.warn(`LLM 调用失败，返回占位简评: ${(e as Error).message}`)
      const sign = Number(priceContext.changePercent) >= 0 ? '上涨' : '下跌'
      brief = `${stock.name} 今日收${sign} ${priceContext.changePercent}%，成交额较 5 日均量${priceContext.vs5dAvgVol.startsWith('+') ? '放大' : '萎缩'}，短期维持 ${Number(priceContext.changePercent) >= 0 ? '多头' : '震荡'} 格局。`
      keyPoints = [
        `价格波动 ${priceContext.changePercent}%，量能 ${priceContext.vs5dAvgVol}`,
        newsSummary ? `近期关注：${newsSummary.slice(0, 30)}` : '暂无明显催化剂',
      ]
    }

    return { brief, keyPoints, priceContext, newsSummary, mock }
  }
}

// 避免 ESLint unused
void sql
void and
