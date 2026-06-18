import { z } from 'zod'
import type { AgentRepository } from '../agent.repository'
import type { AgentTool } from './tool.types'

export const priceHistoryInput = z.object({
  limit: z.number().int().min(1).max(120).optional(),
})

export function createPriceHistoryTool(
  repository: AgentRepository,
): AgentTool<z.infer<typeof priceHistoryInput>> {
  return {
    name: 'get_price_history',
    description: '读取当前股票的日线历史，最新优先，最多 120 条。',
    input: priceHistoryInput,
    execute: async (context, input) => {
      const rows = await repository.getPriceHistory(context.userId, context.stockId, input.limit ?? 120)
      return { items: rows }
    },
  }
}