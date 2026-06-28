import { z } from 'zod'
import type { AgentCitation, AgentSubjectIdentity } from '../agent.types'
import type { SearchClient, SearchUnavailableError } from './search.client'
import { normalizeCitations, wrapSearchMaterial } from './citation'
import type { AgentTool } from './tool.types'

export interface StockNewsToolDeps {
  searchClient: SearchClient
  stockIdentity: (userId: string, stockId: string) => Promise<AgentSubjectIdentity>
}

export const stockNewsInput = z.object({
  query: z.string().min(1).max(200),
  maxResults: z.number().int().min(1).max(20).optional(),
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
      const { code, name, subjectType } = await deps.stockIdentity(context.userId, context.stockId)
      const prefix = subjectType === 'market' ? 'A股市场' : `${code} ${name}`
      const composedQuery = `${prefix} ${input.query}`.trim()
      try {
        const search = await deps.searchClient.search({
          query: composedQuery,
          maxResults: input.maxResults ?? 8,
          signal: context.signal,
        })
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

export type { SearchUnavailableError }
