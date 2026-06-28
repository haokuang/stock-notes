import { Module } from '@nestjs/common'
import type { Pool } from 'pg'
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
import { MiniMaxSearchClient } from './tools/minimax-search.client'
import type { SearchClient } from './tools/search.client'
import { PG_POOL } from '../storage/database/database.module'
import { loadProviderConfig } from './providers/provider-config'
import { DeepSeekProvider } from './providers/deepseek.provider'
import { OpenAIProvider } from './providers/openai.provider'
import { MiniMaxProvider } from './providers/minimax.provider'
import { ProviderRegistry } from './providers/provider-registry'
import type { AgentModelProvider } from './providers/provider.types'
import { AgentOrchestrator } from './agent-orchestrator'
import { AgentRunQueueRepository } from './runs/run-queue.repository'
import { AgentWorker } from './runs/agent-worker.service'
import { RunRecoveryService } from './runs/run-recovery.service'
import { AgentRuntimeService } from './runs/agent-runtime.service'

export const AGENT_TOOL_REGISTRY = Symbol('AGENT_TOOL_REGISTRY')
export const AGENT_SEARCH_CLIENT = Symbol('AGENT_SEARCH_CLIENT')
export const AGENT_PROVIDER_REGISTRY = Symbol('AGENT_PROVIDER_REGISTRY')
export const AGENT_ORCHESTRATOR = Symbol('AGENT_ORCHESTRATOR')
export const AGENT_RUN_QUEUE = Symbol('AGENT_RUN_QUEUE')
export const AGENT_WORKER = Symbol('AGENT_WORKER')
export const AGENT_RECOVERY = Symbol('AGENT_RECOVERY')
export const AGENT_RUNTIME = Symbol('AGENT_RUNTIME')

function resolveMiniMaxApiKey(): string {
  return process.env.MINIMAX_API_KEY?.trim() ?? ''
}

function resolveMiniMaxCliPath(): string | undefined {
  return process.env.MINIMAX_CLI_PATH?.trim() || undefined
}

function resolveMiniMaxCliBaseURL(): string {
  return process.env.MINIMAX_CLI_BASE_URL?.trim() || process.env.MINIMAX_BASE_URL?.trim() || ''
}

function resolveMiniMaxRegion(): string {
  return process.env.MINIMAX_REGION?.trim() ?? ''
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
      provide: AGENT_SEARCH_CLIENT,
      useFactory: () => new MiniMaxSearchClient({
        apiKey: resolveMiniMaxApiKey(),
        baseURL: resolveMiniMaxCliBaseURL(),
        cliPath: resolveMiniMaxCliPath(),
        region: resolveMiniMaxRegion(),
      }),
    },
    {
      provide: AGENT_TOOL_REGISTRY,
      inject: [AgentRepository, AGENT_SEARCH_CLIENT],
      useFactory: (repository: AgentRepository, searchClient: SearchClient) => {
        const stockIdentity = async (_userId: string, stockId: string) => {
          const profile = await repository.getStockProfile(_userId, stockId)
          if (!profile) {
            return { code: '', name: '', subjectType: 'stock' as const }
          }
          return { code: profile.code, name: profile.name, subjectType: profile.subjectType }
        }
        const tools = [
          createStockProfileTool(repository),
          createPriceHistoryTool(repository),
          createStockNotesTool(repository),
          createDailyBriefsTool(repository),
          createStockNewsTool({ searchClient, stockIdentity }),
        ]
        return new AgentToolRegistry({ tools })
      },
    },
    {
      provide: AGENT_PROVIDER_REGISTRY,
      useFactory: () => {
        const config = loadProviderConfig(process.env)
        const providers: AgentModelProvider[] = []
        if (config.deepseek.enabled) providers.push(new DeepSeekProvider(config.deepseek.apiKey, config.deepseek.baseURL!, config.deepseek.model))
        if (config.openai.enabled) providers.push(new OpenAIProvider(config.openai.apiKey, config.openai.model))
        if (config.minimax.enabled) providers.push(new MiniMaxProvider(config.minimax.apiKey, config.minimax.baseURL!, config.minimax.model))
        return new ProviderRegistry(providers)
      },
    },
    {
      provide: AGENT_ORCHESTRATOR,
      inject: [AGENT_PROVIDER_REGISTRY, AGENT_TOOL_REGISTRY, AgentRepository],
      useFactory: (providers: ProviderRegistry, registry: AgentToolRegistry, repository: AgentRepository) => new AgentOrchestrator({
        providerRegistry: providers,
        registry,
        repository,
        stockIdentity: async (userId, stockId) => {
          const stock = await repository.getStockProfile(userId, stockId)
          if (!stock) throw new Error('资源不存在')
          return { code: stock.code, name: stock.name, subjectType: stock.subjectType }
        },
      }),
    },
    {
      provide: AGENT_RUN_QUEUE,
      inject: [PG_POOL],
      useFactory: (pool: Pool) => new AgentRunQueueRepository({ clientFactory: () => pool.connect() }),
    },
    {
      provide: AGENT_WORKER,
      inject: [AGENT_RUN_QUEUE, AGENT_ORCHESTRATOR, AgentRepository],
      useFactory: (queue: AgentRunQueueRepository, orchestrator: AgentOrchestrator, repository: AgentRepository) => new AgentWorker({
        workerId: `agent-${process.pid}`,
        concurrency: boundedInt(process.env.AGENT_WORKER_CONCURRENCY, 2, 1, 10),
        heartbeatIntervalMs: boundedInt(process.env.AGENT_WORKER_HEARTBEAT_MS, 15_000, 1_000, 30_000),
        leaseMs: boundedInt(process.env.AGENT_RUN_LEASE_MS, 45_000, 10_000, 300_000),
        queue,
        orchestrator,
        onStage: (runId, stage) => repository.updateRunStage(runId, stage),
      }),
    },
    {
      provide: AGENT_RECOVERY,
      inject: [AGENT_RUN_QUEUE],
      useFactory: (queue: AgentRunQueueRepository) => new RunRecoveryService({
        queue,
        leaseMs: boundedInt(process.env.AGENT_RUN_LEASE_MS, 45_000, 10_000, 300_000),
      }),
    },
    {
      provide: AGENT_RUNTIME,
      inject: [AGENT_WORKER, AGENT_RECOVERY],
      useFactory: (worker: AgentWorker, recovery: RunRecoveryService) => new AgentRuntimeService({
        worker,
        recovery,
        pollMs: boundedInt(process.env.AGENT_WORKER_POLL_MS, 1_000, 250, 30_000),
      }),
    },
  ],
  exports: [AgentRepository, AgentService, ProviderHealthService, AGENT_TOOL_REGISTRY, AGENT_SEARCH_CLIENT],
})
export class AgentModule {}

function boundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(parsed)))
}
