import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import type { AgentProvider } from '../agent.types'
import { loadProviderConfig } from './provider-config'
import type { ProviderHealth } from './provider.types'

interface Probe {
  (provider: AgentProvider): Promise<ProviderHealth>
}

interface LoggerLike {
  log(message: unknown, ...optional: unknown[]): void
  warn(message: unknown, ...optional: unknown[]): void
  error(message: unknown, ...optional: unknown[]): void
}

interface ProviderHealthDeps {
  providers: Set<AgentProvider>
  probe: Probe
  logger: LoggerLike
  now?: () => number
}

const CHECKING: ProviderHealth = {
  status: 'checking',
  reason: null,
  retryAfter: null,
  checkedAt: '',
}

const UNCONFIGURED: ProviderHealth = {
  status: 'unavailable',
  reason: '模型当前未配置',
  retryAfter: null,
  checkedAt: '',
}

@Injectable()
export class ProviderHealthService implements OnModuleInit {
  private readonly logger: LoggerLike
  private readonly deps: ProviderHealthDeps
  private readonly states = new Map<AgentProvider, ProviderHealth>()

  constructor(deps: ProviderHealthDeps) {
    this.deps = deps
    this.logger = deps.logger
    for (const provider of deps.providers) {
      this.states.set(provider, { ...CHECKING })
    }
  }

  onModuleInit(): void {
    for (const provider of this.deps.providers) {
      void this.refresh(provider)
    }
  }

  async refresh(provider: AgentProvider): Promise<ProviderHealth> {
    if (!this.deps.providers.has(provider)) {
      const result = { ...UNCONFIGURED }
      this.states.set(provider, result)
      return result
    }
    try {
      const next = await this.deps.probe(provider)
      this.states.set(provider, next)
      this.logger.log(
        `[agent-health] provider=${provider} status=${next.status} retryAfter=${next.retryAfter ?? 'none'} upstreamRequestId=${next.reason ? 'safe-only' : 'none'}`,
      )
      return next
    } catch (cause) {
      const fallback: ProviderHealth = {
        status: 'unavailable',
        reason: '健康检查异常',
        retryAfter: null,
        checkedAt: new Date(this.deps.now?.() ?? Date.now()).toISOString(),
      }
      this.states.set(provider, fallback)
      this.logger.error(
        `[agent-health] provider=${provider} status=unavailable cause=${cause instanceof Error ? cause.name : 'unknown'}`,
      )
      return fallback
    }
  }

  getHealth(provider: AgentProvider): ProviderHealth {
    return this.states.get(provider) ?? { ...UNCONFIGURED }
  }

  snapshot(): Partial<Record<AgentProvider, ProviderHealth>> {
    return Object.fromEntries(this.states.entries()) as Partial<Record<AgentProvider, ProviderHealth>>
  }
}

/**
 * NestJS factory: builds a Probe per provider from validated config + adapters.
 * MiniMax probe uses the configured `baseURL` (Coding Plan vs 正式 API).
 */
export function createProviderHealthService(): ProviderHealthService {
  const config = loadProviderConfig(process.env)
  const logger = new Logger('ProviderHealthService')
  const providers = new Set<AgentProvider>(
    (['deepseek', 'openai', 'minimax'] as AgentProvider[]).filter((p) => {
      const entry = config[p]
      return Boolean(entry?.enabled)
    }),
  )

  const probe: Probe = async (provider) => {
    const entry = config[provider]
    if (!entry?.enabled) {
      return { ...UNCONFIGURED }
    }
    return probeWithFetch(provider, entry.baseURL ?? null, entry.apiKey)
  }

  return new ProviderHealthService({ providers, probe, logger })
}

async function probeWithFetch(
  provider: AgentProvider,
  baseURL: string | null,
  apiKey: string,
): Promise<ProviderHealth> {
  if (!baseURL || !apiKey) {
    return { status: 'unavailable', reason: '模型当前未配置', retryAfter: null, checkedAt: new Date().toISOString() }
  }
  try {
    const response = await fetch(`${baseURL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env[`AGENT_${provider.toUpperCase()}_MODEL`] ?? 'ping',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
    })
    if (response.ok) {
      return { status: 'available', reason: null, retryAfter: null, checkedAt: new Date().toISOString() }
    }
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after'))
      return {
        status: 'rate_limited',
        reason: '模型请求过于频繁，请稍后重试',
        retryAfter: Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter : null,
        checkedAt: new Date().toISOString(),
      }
    }
    if (response.status === 401 || response.status === 403) {
      return { status: 'unavailable', reason: '模型鉴权失败，请联系管理员', retryAfter: null, checkedAt: new Date().toISOString() }
    }
    return { status: 'unavailable', reason: '模型当前不可用', retryAfter: null, checkedAt: new Date().toISOString() }
  } catch {
    return { status: 'unavailable', reason: '模型网络连接失败，请重试', retryAfter: null, checkedAt: new Date().toISOString() }
  }
}