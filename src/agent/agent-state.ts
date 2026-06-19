import type { AgentMessage, AgentProvider, AgentRun } from './agent.types'

export type AgentStage =
  | 'queued'
  | 'loading_context'
  | 'calling_tools'
  | 'searching'
  | 'generating'
  | 'completed'
  | 'failed'

export interface AgentErrorCode {
  code: string
  message: string
  retryAfter: number | null
}

const STAGE_LABELS: Record<AgentStage, string> = {
  queued: '排队中',
  loading_context: '加载历史',
  calling_tools: '读取本地资料',
  searching: '联网检索',
  generating: '生成回答',
  completed: '已完成',
  failed: '失败',
}

const ERROR_PRESENTATIONS: Record<string, { label: string; retryable: boolean }> = {
  PROVIDER_AUTH_FAILED: { label: '模型鉴权失败，请联系管理员', retryable: false },
  PROVIDER_QUOTA_EXHAUSTED: { label: '模型配额已用完', retryable: false },
  PROVIDER_RATE_LIMITED: { label: '模型请求过于频繁，请稍后重试', retryable: false },
  PROVIDER_INVALID_REQUEST: { label: '请求参数无效', retryable: false },
  AGENT_TOOL_LIMIT: { label: '工具调用超过 6 轮上限', retryable: false },
  AGENT_TIMEOUT: { label: '生成超时，请稍后重试', retryable: true },
  AGENT_WORKER_LOST: { label: '后台任务被回收，请重试', retryable: true },
}

export function stageLabel(stage: AgentStage | string | undefined | null): string {
  if (!stage) return '排队中'
  return STAGE_LABELS[stage as AgentStage] ?? '处理中'
}

export function errorPresentation(errorCode: string | null | undefined): {
  label: string
  retryable: boolean
} {
  if (!errorCode) return { label: '未知错误', retryable: true }
  return ERROR_PRESENTATIONS[errorCode] ?? { label: '生成失败，请稍后重试', retryable: true }
}

export function formatRetryAfter(retryAfter: number | null | undefined): string | null {
  if (retryAfter == null || !Number.isFinite(retryAfter) || retryAfter < 0) return null
  if (retryAfter < 60) return `${Math.round(retryAfter)} 秒后重试`
  const minutes = Math.round(retryAfter / 60)
  return `${minutes} 分钟后重试`
}

export function upsertMessages(messages: AgentMessage[], incoming: AgentMessage[]): AgentMessage[] {
  if (incoming.length === 0) return messages
  const map = new Map<string, AgentMessage>()
  for (const m of messages) map.set(m.id, m)
  for (const m of incoming) {
    const existing = map.get(m.id)
    if (existing) {
      map.set(m.id, { ...existing, ...m, createdAt: existing.createdAt })
    } else {
      map.set(m.id, m)
    }
  }
  return Array.from(map.values()).sort((a, b) => compareTimestamp(a, b))
}

function compareTimestamp(a: AgentMessage, b: AgentMessage): number {
  if (a.createdAt === b.createdAt) return a.id.localeCompare(b.id)
  return a.createdAt < b.createdAt ? -1 : 1
}

export function pickActiveRun(runs: AgentRun[]): AgentRun | null {
  if (runs.length === 0) return null
  const active = runs.find((r) => r.status === 'queued' || r.status === 'running')
  if (active) return active
  return runs.slice().sort((a, b) => compareRunTimestamp(a, b))[runs.length - 1] ?? null
}

function compareRunTimestamp(a: AgentRun, b: AgentRun): number {
  if (a.createdAt === b.createdAt) return a.id.localeCompare(b.id)
  return a.createdAt < b.createdAt ? -1 : 1
}

export function mergeRun(existing: AgentRun | null, next: AgentRun): AgentRun {
  if (!existing) return next
  return { ...existing, ...next, createdAt: existing.createdAt }
}

export function shouldPoll(run: AgentRun | null | undefined): boolean {
  if (!run) return false
  return run.status === 'queued' || run.status === 'running'
}

export function isTerminal(run: AgentRun | null | undefined): boolean {
  if (!run) return true
  return run.status === 'completed' || run.status === 'failed'
}

export function providerLabel(provider: AgentProvider | null | undefined): string {
  if (!provider) return ''
  return ({ deepseek: 'DeepSeek', openai: 'OpenAI', minimax: 'MiniMax' } as const)[provider] ?? provider
}

export function providerDescription(provider: AgentProvider | null | undefined, label: string, model: string | null | undefined, credentialMode: string | null | undefined): string {
  if (!provider) return label
  if (provider === 'minimax' && credentialMode === 'coding_plan') {
    return `${label}（Coding Plan）`
  }
  return model ? `${label} · ${model}` : label
}
