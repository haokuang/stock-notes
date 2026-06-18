import type { AgentProvider } from '../agent.types'
import { ProviderError } from './provider-error'
import type { AgentModelProvider } from './provider.types'

export class ProviderRegistry {
  private readonly providers: Map<AgentProvider, AgentModelProvider>

  constructor(entries: AgentModelProvider[]) {
    this.providers = new Map(entries.map((entry) => [entry.provider, entry]))
  }

  get(provider: AgentProvider): AgentModelProvider {
    const selected = this.providers.get(provider)
    if (!selected) {
      throw new ProviderError(provider, 'PROVIDER_UNAVAILABLE', false, '模型当前未配置', null)
    }
    return selected
  }

  list(): AgentModelProvider[] {
    return [...this.providers.values()]
  }
}
