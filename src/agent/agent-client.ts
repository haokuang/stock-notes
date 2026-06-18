import { Network } from '../network'
import { createAgentApi, type AgentApiClient } from './agent-api'

let cachedClient: AgentApiClient | null = null

export function getAgentApi(): AgentApiClient {
  if (cachedClient) return cachedClient
  const wrapper = (option: { url: string; method: string; data?: unknown }) =>
    Network.request(option as never) as unknown as Promise<{ statusCode: number; data: unknown }>
  cachedClient = createAgentApi(wrapper)
  return cachedClient
}

export type { AgentApiClient } from './agent-api'