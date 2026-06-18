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

export interface AgentModelOption {
  provider: AgentProvider
  model: string
  label: string
  available: boolean
  credentialMode?: AgentCredentialMode
  unavailableReason?: string
  retryAfter?: number
}