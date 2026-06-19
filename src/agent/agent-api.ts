import type {
  AgentCitation,
  AgentMessage,
  AgentModelOption,
  AgentProvider,
  AgentRun,
  AgentThread,
} from './agent.types'

export interface AgentModelListResponse {
  data: AgentModelOption[]
}

export interface AgentThreadResponse {
  data: AgentThread | null
}

export interface AgentMessagesResponse {
  data: {
    items: AgentMessage[]
    nextCursor: string | null
  }
}

export interface AgentRunResponse {
  data: AgentRun
}

export interface AgentReportSummary {
  id: string
  stockId: string | null
  stockCode: string | null
  stockName: string | null
  title: string
  status: string
  agentRunId: string | null
  createdAt: string
}

export interface AgentReportListResponse {
  data: AgentReportSummary[]
}

export interface AgentReportDetailResponse {
  data: AgentReportDetail
}

export interface AgentReportDetail {
  id: string
  stockId: string | null
  stockCode: string | null
  stockName: string | null
  title: string
  status: string
  content: string
  citations: AgentCitation[]
  provider: AgentProvider | null
  model: string | null
  agentRunId: string | null
  createdAt: string
}

export interface AgentSubmitMessageResponse {
  data: {
    messageId: string
    threadId: string
    run: AgentRun
    replayed: boolean
  }
}

export class AgentApiError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'AgentApiError'
  }
}

declare const __DEV__: boolean | undefined
const isDev = typeof __DEV__ === 'undefined' ? true : __DEV__

interface Envelope<T> {
  data?: T
  message?: string
}

export function unwrapApiResponse<T>(response: { statusCode: number; data: unknown }): T {
  const body = (response.data ?? {}) as Envelope<T>
  if (isDev) {
    // eslint-disable-next-line no-console
    console.log('[agent-api] response body', response.data)
  }
  if (response.statusCode >= 400) {
    throw new AgentApiError(typeof body?.message === 'string' ? body.message : '请求失败')
  }
  if (!body || typeof body !== 'object' || !('data' in body)) {
    throw new AgentApiError('响应格式错误')
  }
  return body.data as T
}

export interface AgentRequestLike {
  url: string
  method: string
  data?: unknown
}

export interface AgentApiClient {
  listModels(): Promise<AgentModelOption[]>
  getThread(stockId: string): Promise<AgentThread | null>
  createThread(stockId: string): Promise<AgentThread>
  listMessages(threadId: string, cursor?: string | null, limit?: number): Promise<AgentMessagesResponse['data']>
  getRun(runId: string): Promise<AgentRun>
  submitMessage(threadId: string, body: { content: string; provider: AgentProvider; model: string; clientRequestId: string }): Promise<AgentSubmitMessageResponse['data']>
  retryRun(runId: string, body: { clientRequestId: string; provider?: AgentProvider; model?: string }): Promise<AgentSubmitMessageResponse['data']>
  saveReport(runId: string): Promise<AgentReportDetail>
  listReports(stockId: string): Promise<AgentReportSummary[]>
  getReport(reportId: string): Promise<AgentReportDetail>
}

export function createAgentApi(request: (option: AgentRequestLike) => Promise<{ statusCode: number; data: unknown }>): AgentApiClient {
  return {
    async listModels() {
      const response = await request({ url: '/api/agent/models', method: 'GET' })
      return unwrapApiResponse<AgentModelOption[]>(response)
    },
    async getThread(stockId: string) {
      const response = await request({ url: `/api/agent/threads?stock_id=${encodeURIComponent(stockId)}`, method: 'GET' })
      return unwrapApiResponse<AgentThread | null>(response)
    },
    async createThread(stockId: string) {
      const response = await request({ url: '/api/agent/threads', method: 'POST', data: { stock_id: stockId } })
      return unwrapApiResponse<AgentThread>(response)
    },
    async listMessages(threadId, cursor, limit = 20) {
      const params = new URLSearchParams()
      if (cursor) params.set('cursor', cursor)
      params.set('limit', String(limit))
      const response = await request({ url: `/api/agent/threads/${threadId}/messages?${params.toString()}`, method: 'GET' })
      return unwrapApiResponse<AgentMessagesResponse['data']>(response)
    },
    async getRun(runId) {
      const response = await request({ url: `/api/agent/runs/${runId}`, method: 'GET' })
      return unwrapApiResponse<AgentRun>(response)
    },
    async submitMessage(threadId, body) {
      const response = await request({ url: `/api/agent/threads/${threadId}/messages`, method: 'POST', data: body })
      return unwrapApiResponse<AgentSubmitMessageResponse['data']>(response)
    },
    async retryRun(runId, body) {
      const response = await request({ url: `/api/agent/runs/${runId}/retry`, method: 'POST', data: body })
      return unwrapApiResponse<AgentSubmitMessageResponse['data']>(response)
    },
    async saveReport(runId) {
      const response = await request({ url: `/api/agent/runs/${runId}/save-report`, method: 'POST' })
      return unwrapApiResponse<AgentReportDetail>(response)
    },
    async listReports(stockId) {
      const response = await request({ url: `/api/agent/reports?stock_id=${encodeURIComponent(stockId)}`, method: 'GET' })
      return unwrapApiResponse<AgentReportSummary[]>(response)
    },
    async getReport(reportId) {
      const response = await request({ url: `/api/agent/reports/${reportId}`, method: 'GET' })
      return unwrapApiResponse<AgentReportDetail>(response)
    },
  }
}
