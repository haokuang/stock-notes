import type {
  AgentCitation,
  AgentMessage,
  AgentMessageRow,
  AgentReportSummary,
  AgentReportSummaryRow,
  AgentRun,
  AgentRunRow,
  AgentThread,
  AgentThreadRow,
  AgentToolCall,
  AgentToolCallRow,
} from './agent.types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

export function parseCitations(value: unknown): AgentCitation[] {
  if (!Array.isArray(value)) return []

  return value.map((citation) => {
    if (
      !isRecord(citation)
      || typeof citation.id !== 'string'
      || typeof citation.title !== 'string'
      || typeof citation.url !== 'string'
      || citation.url.length === 0
    ) {
      throw new Error('Invalid stored citation')
    }

    return {
      id: citation.id,
      title: citation.title,
      url: citation.url,
      source: typeof citation.source === 'string' ? citation.source : '',
      snippet: typeof citation.snippet === 'string' ? citation.snippet : '',
      publishedAt: typeof citation.publishedAt === 'string' ? citation.publishedAt : null,
    }
  })
}

export function mapAgentThreadRow(row: AgentThreadRow): AgentThread {
  return {
    id: row.id,
    userId: row.user_id,
    stockId: row.stock_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapAgentMessageRow(row: AgentMessageRow): AgentMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    userId: row.user_id,
    role: row.role,
    content: row.content,
    provider: row.provider,
    model: row.model,
    runId: row.run_id,
    citations: parseCitations(row.citations),
    metadata: parseRecord(row.metadata),
    createdAt: row.created_at,
  }
}

export function mapAgentRunRow(row: AgentRunRow): AgentRun {
  return {
    id: row.id,
    threadId: row.thread_id,
    userId: row.user_id,
    userMessageId: row.user_message_id,
    clientRequestId: row.client_request_id,
    provider: row.provider,
    model: row.model,
    credentialMode: row.credential_mode,
    status: row.status,
    stage: row.stage,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    retryAfter: row.retry_after,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapAgentToolCallRow(row: AgentToolCallRow): AgentToolCall {
  return {
    id: row.id,
    runId: row.run_id,
    threadId: row.thread_id,
    userId: row.user_id,
    toolName: row.tool_name,
    arguments: parseRecord(row.arguments),
    result: row.result === null ? null : parseRecord(row.result),
    status: row.status,
    errorCode: row.error_code,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }
}

export function mapAgentReportSummaryRow(row: AgentReportSummaryRow): AgentReportSummary {
  return {
    id: row.id,
    stockId: row.stock_id,
    stockCode: row.stock_code,
    stockName: row.stock_name,
    title: row.title,
    status: row.status,
    agentRunId: row.agent_run_id,
    createdAt: row.created_at,
  }
}
