import { z } from 'zod'
import type { AgentRepository } from '../agent.repository'
import type { AgentTool } from './tool.types'

export const stockNotesInput = z.object({
  limit: z.number().int().min(1).max(50).optional(),
  maxContentLength: z.number().int().min(1).max(4000).optional(),
})

export function createStockNotesTool(
  repository: AgentRepository,
): AgentTool<z.infer<typeof stockNotesInput>> {
  return {
    name: 'get_stock_notes',
    description: '读取当前股票的最近观点笔记，最新优先，最多 50 条，每条内容最长 4000 字符。',
    input: stockNotesInput,
    execute: async (context, input) => {
      const items = await repository.getStockNotes(
        context.userId,
        context.stockId,
        input.limit ?? 50,
        input.maxContentLength ?? 4000,
      )
      return {
        items: items.map((note) => ({
          id: note.id,
          title: note.title,
          direction: note.direction,
          entryPrice: note.entry_price,
          targetPrice: note.target_price,
          stopLoss: note.stop_loss,
          tags: note.tags,
          content: note.content,
          createdAt: note.created_at,
        })),
      }
    },
  }
}