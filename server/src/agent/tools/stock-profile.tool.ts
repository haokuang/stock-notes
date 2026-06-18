import { z } from 'zod'
import type { AgentRepository } from '../agent.repository'
import type { AgentTool } from './tool.types'

export const stockProfileInput = z.object({})

export function createStockProfileTool(
  repository: AgentRepository,
): AgentTool<z.infer<typeof stockProfileInput>> {
  return {
    name: 'get_stock_profile',
    description: '读取当前股票的基础资料（代码、名称、行业、最近日线字段），不暴露内部 ID。',
    input: stockProfileInput,
    execute: async (context) => {
      const profile = await repository.getStockProfile(context.userId, context.stockId)
      if (!profile) {
        return { found: false }
      }
      return { found: true, profile }
    },
  }
}