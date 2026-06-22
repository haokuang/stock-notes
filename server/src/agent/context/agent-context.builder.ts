import type { AgentMessage, AgentRun, AgentSubjectIdentity, AgentSubjectType, AgentToolCall } from '../agent.types'
import type { AgentStandardMessage } from '../providers/provider.types'
import type { AgentRepository } from '../agent.repository'
import type { AgentToolDefinition } from '../providers/provider.types'
import { buildSystemPrompt, SystemPromptInput } from './system-prompt'

export interface BuildAgentContextInput {
  run: AgentRun
  userId: string
  stockId: string
  threadId: string
  repository: Pick<AgentRepository, 'findThread' | 'listMessages'>
  stockIdentity: (userId: string, stockId: string) => Promise<AgentSubjectIdentity>
  tools: AgentToolDefinition[]
  maxContextMessages?: number
}

export interface BuildAgentContextOutput {
  systemPrompt: string
  messages: AgentStandardMessage[]
  stockIdentity: AgentSubjectIdentity
  tools: AgentToolDefinition[]
}

const DEFAULT_MAX_CONTEXT_MESSAGES = 40
const MARKET_UNSUPPORTED_TOOLS = new Set(['get_price_history', 'get_daily_briefs'])

function toolsForSubject(
  tools: AgentToolDefinition[],
  subjectType: AgentSubjectType,
): AgentToolDefinition[] {
  return subjectType === 'market'
    ? tools.filter((tool) => !MARKET_UNSUPPORTED_TOOLS.has(tool.name))
    : tools
}

interface PriorToolCall {
  id?: string
  name?: string
  arguments?: unknown
}

interface PriorToolResult {
  toolCallId?: string
  toolName?: string
  content: string
}

function prefixProvider(provider: string | null, content: string): string {
  return provider ? `[${provider}] ${content}` : content
}

export async function buildAgentContext(
  input: BuildAgentContextInput,
): Promise<BuildAgentContextOutput> {
  const thread = await input.repository.findThread(input.userId, input.threadId)
  if (!thread) throw new Error('Thread not found')
  const identity = await input.stockIdentity(input.userId, input.stockId)
  const limit = input.maxContextMessages ?? DEFAULT_MAX_CONTEXT_MESSAGES
  const page = await input.repository.listMessages(
    input.userId,
    input.threadId,
    null,
    limit + 1,
  )
  const ascending = page.items.slice().reverse()
  const currentMessage = ascending.find((m) => m.id === input.run.userMessageId)
    ?? ascending.at(-1)
  if (!currentMessage) throw new Error('Current user message not found')
  const history = ascending.filter((m) => m.id !== currentMessage.id)

  const promptInput: SystemPromptInput = {
    provider: input.run.provider,
    model: input.run.model,
    stockCode: identity.code,
    stockName: identity.name,
    subjectType: identity.subjectType,
  }
  const systemPrompt = buildSystemPrompt(promptInput)

  const neutralHistory: AgentStandardMessage[] = []
  for (const message of history) {
    neutralHistory.push(...mapMessage(message))
  }

  const finalMessages: AgentStandardMessage[] = [
    { role: 'system', content: systemPrompt },
    ...neutralHistory,
    { role: 'user', content: currentMessage.content },
  ]

  return {
    systemPrompt,
    messages: enforceContextSize(finalMessages, limit),
    stockIdentity: identity,
    tools: toolsForSubject(input.tools, identity.subjectType),
  }
}

function mapMessage(message: AgentMessage): AgentStandardMessage[] {
  if (message.role === 'tool') {
    const result = (message.metadata ?? {}) as Partial<PriorToolResult>
    const tool: AgentStandardMessage = {
      role: 'tool',
      content: message.content,
    }
    if (typeof result.toolCallId === 'string') tool.toolCallId = result.toolCallId
    return [tool]
  }
  if (message.role === 'assistant') {
    const meta = (message.metadata ?? {}) as { toolCalls?: PriorToolCall[] }
    const out: AgentStandardMessage = {
      role: 'assistant',
      content: prefixProvider(message.provider, message.content),
    }
    if (Array.isArray(meta.toolCalls) && meta.toolCalls.length > 0) {
      out.toolCalls = meta.toolCalls
        .filter((call) => call && typeof call.id === 'string')
        .map((call) => ({
          id: call.id as string,
          name: typeof call.name === 'string' ? call.name : '',
          arguments: (call.arguments ?? {}) as Record<string, unknown>,
        }))
    }
    return [out]
  }
  return [{ role: 'user', content: message.content }]
}

function enforceContextSize(messages: AgentStandardMessage[], maxMessages: number): AgentStandardMessage[] {
  if (messages.length <= maxMessages) return messages
  const system = messages[0]
  const tail = messages.at(-1)
  const middle = messages.slice(1, -1)
  const truncated = middle.slice(middle.length - (maxMessages - 2))
  return [system, ...truncated, tail as AgentStandardMessage]
}

export type { AgentToolCall }
