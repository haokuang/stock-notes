import { Module } from '@nestjs/common'
import { AgentController } from './agent.controller'
import { AgentRepository } from './agent.repository'
import { AgentService } from './agent.service'
import {
  createProviderHealthService,
  ProviderHealthService,
} from './providers/provider-health.service'
import { createStockProfileTool } from './tools/stock-profile.tool'
import { createPriceHistoryTool } from './tools/price-history.tool'
import { createStockNotesTool } from './tools/stock-notes.tool'
import { createDailyBriefsTool } from './tools/daily-briefs.tool'
import { createStockNewsTool } from './tools/stock-news.tool'
import { AgentToolRegistry } from './tools/tool-registry'
import { TavilyClient } from './tools/tavily.client'

export const AGENT_TOOL_REGISTRY = Symbol('AGENT_TOOL_REGISTRY')
export const AGENT_TAVILY_CLIENT = Symbol('AGENT_TAVILY_CLIENT')

function resolveTavilyApiKey(): string {
  return process.env.TAVILY_API_KEY?.trim() ?? ''
}

@Module({
  controllers: [AgentController],
  providers: [
    AgentRepository,
    AgentService,
    {
      provide: ProviderHealthService,
      useFactory: () => createProviderHealthService(),
    },
    {
      provide: AGENT_TAVILY_CLIENT,
      useFactory: () => new TavilyClient({ apiKey: resolveTavilyApiKey() }),
    },
    {
      provide: AGENT_TOOL_REGISTRY,
      inject: [AgentRepository, AGENT_TAVILY_CLIENT],
      useFactory: (repository: AgentRepository, tavily: TavilyClient) => {
        const stockIdentity = async (_userId: string, stockId: string) => {
          const profile = await repository.getStockProfile(_userId, stockId)
          if (!profile) {
            return { code: '', name: '' }
          }
          return { code: profile.code, name: profile.name }
        }
        const tools = [
          createStockProfileTool(repository),
          createPriceHistoryTool(repository),
          createStockNotesTool(repository),
          createDailyBriefsTool(repository),
          createStockNewsTool({ tavily, stockIdentity }),
        ]
        return new AgentToolRegistry({ tools })
      },
    },
  ],
  exports: [AgentRepository, AgentService, ProviderHealthService, AGENT_TOOL_REGISTRY, AGENT_TAVILY_CLIENT],
})
export class AgentModule {}
