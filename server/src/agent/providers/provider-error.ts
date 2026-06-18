import type { AgentProvider } from '../agent.types'

export type ProviderErrorCode =
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_QUOTA_EXHAUSTED'
  | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_INVALID_REQUEST'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_TEMPORARY_FAILURE'
  | 'PROVIDER_UNAVAILABLE'

export class ProviderError extends Error {
  readonly cause: unknown

  constructor(
    readonly provider: AgentProvider,
    readonly code: ProviderErrorCode,
    readonly retryable: boolean,
    readonly safeMessage: string,
    readonly retryAfter: number | null,
    options?: { cause?: unknown },
  ) {
    super(safeMessage)
    this.name = 'ProviderError'
    this.cause = options?.cause
  }
}

function record(error: unknown): Record<string, unknown> {
  return typeof error === 'object' && error !== null ? error as Record<string, unknown> : {}
}

function parseRetryAfter(error: Record<string, unknown>): number | null {
  const headers = record(error.headers)
  const raw = headers['retry-after']
  const parsed = typeof raw === 'string' || typeof raw === 'number' ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

export function normalizeProviderError(provider: AgentProvider, input: unknown): ProviderError {
  if (input instanceof ProviderError) return input
  const error = record(input)
  const status = typeof error.status === 'number' ? error.status : null
  const code = typeof error.code === 'string' ? error.code.toLowerCase() : ''
  const name = typeof error.name === 'string' ? error.name : ''

  if (name === 'AbortError') {
    return new ProviderError(provider, 'PROVIDER_TIMEOUT', true, '模型调用超时，请重试', null, { cause: input })
  }
  if (status === 401 || status === 403) {
    return new ProviderError(provider, 'PROVIDER_AUTH_FAILED', false, '模型鉴权失败，请联系管理员', null, { cause: input })
  }
  if (status === 429 && (code.includes('quota') || code.includes('insufficient'))) {
    return new ProviderError(provider, 'PROVIDER_QUOTA_EXHAUSTED', false, '模型额度已用尽', null, { cause: input })
  }
  if (status === 429) {
    return new ProviderError(provider, 'PROVIDER_RATE_LIMITED', false, '模型请求过于频繁，请稍后重试', parseRetryAfter(error), { cause: input })
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderError(provider, 'PROVIDER_INVALID_REQUEST', false, '模型请求参数无效', null, { cause: input })
  }
  if (status != null && status >= 500) {
    return new ProviderError(provider, 'PROVIDER_TEMPORARY_FAILURE', true, '模型服务暂时不可用，请重试', null, { cause: input })
  }
  if (input instanceof TypeError) {
    return new ProviderError(provider, 'PROVIDER_TEMPORARY_FAILURE', true, '模型网络连接失败，请重试', null, { cause: input })
  }
  return new ProviderError(provider, 'PROVIDER_UNAVAILABLE', false, '模型当前不可用', null, { cause: input })
}
