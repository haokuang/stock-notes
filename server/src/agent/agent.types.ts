export type AgentProvider = 'deepseek' | 'openai' | 'minimax'

export type AgentCredentialMode = 'api' | 'coding_plan'

export type AgentMessageRole = 'user' | 'assistant' | 'tool'

export type AgentRunStatus = 'queued' | 'running' | 'completed' | 'failed'

export type AgentRunStage =
  | 'queued'
  | 'loading_context'
  | 'calling_tools'
  | 'searching'
  | 'generating'
  | 'completed'
  | 'failed'

export type AgentToolCallStatus = 'running' | 'completed' | 'failed'

export interface AgentCitation {
  id: string
  title: string
  url: string
  source: string
  snippet: string
  publishedAt: string | null
}

export interface AgentThread {
  id: string
  userId: string
  stockId: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface AgentMessage {
  id: string
  threadId: string
  userId: string
  role: AgentMessageRole
  content: string
  provider: AgentProvider | null
  model: string | null
  runId: string | null
  citations: AgentCitation[]
  metadata: Record<string, unknown>
  createdAt: string
}

export interface AgentRun {
  id: string
  threadId: string
  userId: string
  userMessageId: string
  clientRequestId: string
  provider: AgentProvider
  model: string
  credentialMode: AgentCredentialMode | null
  status: AgentRunStatus
  stage: AgentRunStage
  attemptCount: number
  maxAttempts: number
  lockedAt: string | null
  lockedBy: string | null
  startedAt: string | null
  completedAt: string | null
  errorCode: string | null
  errorMessage: string | null
  retryAfter: number | null
  createdAt: string
  updatedAt: string
}

export interface AgentToolCall {
  id: string
  runId: string
  threadId: string
  userId: string
  toolName: string
  arguments: Record<string, unknown>
  result: Record<string, unknown> | null
  status: AgentToolCallStatus
  errorCode: string | null
  durationMs: number | null
  createdAt: string
  completedAt: string | null
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

export interface AgentModelOption {
  provider: AgentProvider
  model: string
  label: string
  available: boolean
  credentialMode?: AgentCredentialMode
  unavailableReason?: string
  retryAfter?: number
}

export interface MessagePage<T> {
  items: T[]
  nextCursor: string | null
}

export interface AgentThreadRow {
  id: string
  user_id: string
  stock_id: string
  title: string
  created_at: string
  updated_at: string
}

export interface AgentMessageRow {
  id: string
  thread_id: string
  user_id: string
  role: AgentMessageRole
  content: string
  provider: AgentProvider | null
  model: string | null
  run_id: string | null
  citations: unknown
  metadata: unknown
  created_at: string
}

export interface AgentRunRow {
  id: string
  thread_id: string
  user_id: string
  user_message_id: string
  client_request_id: string
  provider: AgentProvider
  model: string
  credential_mode: AgentCredentialMode | null
  status: AgentRunStatus
  stage: AgentRunStage
  attempt_count: number
  max_attempts: number
  locked_at: string | null
  locked_by: string | null
  started_at: string | null
  completed_at: string | null
  error_code: string | null
  error_message: string | null
  retry_after: number | null
  created_at: string
  updated_at: string
}

export interface AgentToolCallRow {
  id: string
  run_id: string
  thread_id: string
  user_id: string
  tool_name: string
  arguments: unknown
  result: unknown
  status: AgentToolCallStatus
  error_code: string | null
  duration_ms: number | null
  created_at: string
  completed_at: string | null
}

export interface AgentReportSummaryRow {
  id: string
  stock_id: string | null
  stock_code: string | null
  stock_name: string | null
  title: string
  status: string
  agent_run_id: string | null
  created_at: string
}
