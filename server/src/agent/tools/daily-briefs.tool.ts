import { z } from 'zod'
import type { AgentRepository } from '../agent.repository'
import type { AgentTool } from './tool.types'

export const dailyBriefsInput = z.object({
  limit: z.number().int().min(1).max(7).optional(),
})

export function createDailyBriefsTool(
  repository: AgentRepository,
): AgentTool<z.infer<typeof dailyBriefsInput>> {
  return {
    name: 'get_daily_briefs',
    description: '读取当前股票的最近每日简评，最新优先，最多 7 条。',
    input: dailyBriefsInput,
    execute: async (context, input) => {
      const items = await repository.getDailyBriefs(
        context.userId,
        context.stockId,
        input.limit ?? 7,
      )
      return {
        items: items.map((brief) => ({
          id: brief.id,
          tradeDate: brief.trade_date,
          signal: brief.signal,
          action: brief.action,
          technicalAnalysis: brief.technical_analysis,
          logicJudgment: brief.logic_judgment,
          priceAtBrief: brief.price_at_brief,
          stopLossTriggered: brief.stop_loss_triggered,
          createdAt: brief.created_at,
        })),
      }
    },
  }
}