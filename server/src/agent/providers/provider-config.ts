import { z } from 'zod'
import type { AgentCredentialMode, AgentModelOption, AgentProvider } from '../agent.types'
import type { ProviderHealth } from './provider.types'

interface ProviderConfigEntry {
  enabled: boolean
  apiKey: string
  baseURL?: string
  model: string
  unavailableReason?: string
}

interface MiniMaxConfigEntry extends ProviderConfigEntry {
  credentialMode: AgentCredentialMode
}

export interface ProviderConfig {
  deepseek: ProviderConfigEntry
  openai: ProviderConfigEntry
  minimax: MiniMaxConfigEntry
}

const value = (env: NodeJS.ProcessEnv, key: string) => env[key]?.trim() ?? ''

export function loadProviderConfig(env: NodeJS.ProcessEnv): ProviderConfig {
  const modeResult = z.enum(['api', 'coding_plan']).safeParse(value(env, 'MINIMAX_CREDENTIAL_MODE') || 'api')
  if (!modeResult.success) throw new Error('MINIMAX_CREDENTIAL_MODE 配置无效')
  const credentialMode = modeResult.data
  const miniKey = credentialMode === 'coding_plan'
    ? value(env, 'MINIMAX_CODING_PLAN_API_KEY')
    : value(env, 'MINIMAX_API_KEY')
  const miniBase = credentialMode === 'coding_plan'
    ? value(env, 'MINIMAX_CODING_PLAN_BASE_URL')
    : value(env, 'MINIMAX_BASE_URL')
  const miniModel = value(env, 'AGENT_MINIMAX_MODEL')
  const deepseekKey = value(env, 'DEEPSEEK_API_KEY')
  const deepseekModel = value(env, 'AGENT_DEEPSEEK_MODEL')
  const openaiKey = value(env, 'OPENAI_API_KEY')
  const openaiModel = value(env, 'AGENT_OPENAI_MODEL')

  return {
    deepseek: {
      enabled: Boolean(deepseekKey && deepseekModel),
      apiKey: deepseekKey,
      baseURL: value(env, 'DEEPSEEK_BASE_URL') || 'https://api.deepseek.com',
      model: deepseekModel,
      unavailableReason: deepseekKey && deepseekModel ? undefined : 'DeepSeek 未配置',
    },
    openai: {
      enabled: Boolean(openaiKey && openaiModel),
      apiKey: openaiKey,
      baseURL: 'https://api.openai.com/v1',
      model: openaiModel,
      unavailableReason: openaiKey && openaiModel ? undefined : 'OpenAI 未配置',
    },
    minimax: {
      enabled: Boolean(miniKey && miniBase && miniModel),
      apiKey: miniKey,
      baseURL: miniBase,
      model: miniModel,
      credentialMode,
      unavailableReason: miniKey && miniBase && miniModel ? undefined : 'MiniMax 所选凭据未配置完整',
    },
  }
}

export function buildModelCatalog(
  config: ProviderConfig,
  health: Partial<Record<AgentProvider, ProviderHealth>>,
): AgentModelOption[] {
  const entries: Array<[AgentProvider, ProviderConfigEntry, string]> = [
    ['deepseek', config.deepseek, config.deepseek.model],
    ['openai', config.openai, config.openai.model],
    [
      'minimax',
      config.minimax,
      config.minimax.model
        ? `${config.minimax.model} · ${config.minimax.credentialMode === 'coding_plan' ? 'Coding Plan' : '正式 API'}`
        : '',
    ],
  ]

  return entries.flatMap(([provider, entry, label]) => {
    if (!entry.model) return []
    const currentHealth = health[provider]
    const healthy = !currentHealth || currentHealth.status === 'available' || currentHealth.status === 'checking'
    const option: AgentModelOption = {
      provider,
      model: entry.model,
      label,
      available: entry.enabled && healthy,
    }
    if (provider === 'minimax') option.credentialMode = config.minimax.credentialMode
    const reason = currentHealth?.reason ?? entry.unavailableReason
    if (!option.available && reason) option.unavailableReason = reason
    if (currentHealth?.retryAfter != null) option.retryAfter = currentHealth.retryAfter
    return [option]
  })
}
