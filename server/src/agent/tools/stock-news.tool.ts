import { z } from 'zod'
import type { AgentCitation } from '../agent.types'
import type { TavilyClient, TavilyUnavailableError } from './tavily.client'
import { normalizeCitations, wrapSearchMaterial } from './citation'
import type { AgentTool } from './tool.types'

export interface StockNewsToolDeps {
  tavily: TavilyClient
  stockIdentity: (userId: string, stockId: string) => Promise<{ code: string; name: string }>
}

export const stockNewsInput = z.object({
  query: z.string().min(1).max(200),
  maxResults: z.number().int().min(1).max(8).optional(),
})

export interface StockNewsToolResult {
  query: string
  citations: AgentCitation[]
  wrappedMaterial: string
  searchUnavailable: boolean
}

export function createStockNewsTool(
  deps: StockNewsToolDeps,
): AgentTool<z.infer<typeof stockNewsInput>> {
  return {
    name: 'search_stock_news',
    description: '基于股票代码/名称 + 当前问题检索最新公开资料；返回经规范化与去重的引用，并附上被标记为"不可信"的检索原文包裹。',
    input: stockNewsInput,
    execute: async (context, input) => {
      const { code, name } = await deps.stockIdentity(context.userId, context.stockId)
      const composedQuery = `${code} ${name} ${input.query}`.trim()
      try {
        const search = await deps.tavily.search({ query: composedQuery, maxResults: input.maxResults ?? 8 })
        const citations = normalizeCitations(search.results)
        const wrapped = wrapSearchMaterial(JSON.stringify(search.results, null, 2))
        const result: StockNewsToolResult = {
          query: composedQuery,
          citations,
          wrappedMaterial: wrapped,
          searchUnavailable: false,
        }
        return result
      } catch (cause) {
        if (typeof cause === 'object' && cause !== null && (cause as { searchUnavailable?: boolean }).searchUnavailable) {
          const result: StockNewsToolResult = {
            query: composedQuery,
            citations: [],
            wrappedMaterial: wrapSearchMaterial(''),
            searchUnavailable: true,
          }
          return result
        }
        throw cause
      }
    },
  }
}

export type { TavilyUnavailableError }