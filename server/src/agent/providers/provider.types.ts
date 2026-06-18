import type { AgentCitation, AgentProvider } from '../agent.types'

export const PROVIDER_HEALTH_STATUSES = [
  'checking',
  'available',
  'unavailable',
  'rate_limited',
] as const

export type ProviderHealthStatus = typeof PROVIDER_HEALTH_STATUSES[number]

export interface AgentProviderToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface AgentStandardMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCallId?: string
  toolCalls?: AgentProviderToolCall[]
}

export interface AgentToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface AgentProviderRequest {
  model: string
  messages: AgentStandardMessage[]
  tools: AgentToolDefinition[]
  signal: AbortSignal
  traceId: string
}

export interface AgentTurnResult {
  content: string
  toolCalls: AgentProviderToolCall[]
  citations: AgentCitation[]
  providerMetadata: Record<string, unknown>
}

export interface ProviderHealth {
  status: ProviderHealthStatus
  reason: string | null
  retryAfter: number | null
  checkedAt: string
}

export interface AgentModelProvider {
  readonly provider: AgentProvider
  generate(request: AgentProviderRequest): Promise<AgentTurnResult>
  checkHealth(): Promise<ProviderHealth>
}
