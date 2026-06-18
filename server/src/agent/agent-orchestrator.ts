import type {
  AgentCitation,
  AgentRun,
  AgentToolCall,
} from './agent.types'
import type { AgentModelProvider, AgentStandardMessage, AgentTurnResult, AgentToolDefinition as ProviderToolDefinition } from './providers/provider.types'
import { AgentToolRegistry } from './tools/tool-registry'
import { AgentToolOwnershipError } from './tools/tool.types'
import { buildAgentContext } from './context/agent-context.builder'
import type { AgentRepository } from './agent.repository'

export class AgentTimeoutError extends Error {
  constructor() {
    super('AGENT_TIMEOUT')
    this.name = 'AgentTimeoutError'
  }
}

export class AgentToolLimitError extends Error {
  constructor() {
    super('AGENT_TOOL_LIMIT')
    this.name = 'AgentToolLimitError'
  }
}

export interface AgentOrchestratorInput {
  run: AgentRun
  userId: string
  stockId: string
  threadId: string
  deadlineMs?: number
  signal?: AbortSignal
}

export interface AgentOrchestratorResult {
  content: string
  citations: AgentCitation[]
  toolCalls: AgentToolCall[]
}

export interface AgentOrchestratorOptions {
  provider: AgentModelProvider
  registry: AgentToolRegistry
  repository: Pick<
    AgentRepository,
    'findThread' | 'listMessages' | 'getStockProfile' | 'getPriceHistory' | 'getStockNotes' | 'getDailyBriefs'
  > & {
    persistToolCall: (call: AgentToolCall) => Promise<AgentToolCall>
    updateRunStage: (runId: string, stage: AgentRun['stage']) => Promise<void>
  }
  stockIdentity: (userId: string, stockId: string) => Promise<{ code: string; name: string }>
  maxCycles?: number
}

const DEFAULT_MAX_CYCLES = 6
const DEFAULT_DEADLINE_MS = 90_000
const MAX_TOOL_RESULT_LENGTH = 4000

export class AgentOrchestrator {
  private readonly provider: AgentModelProvider
  private readonly registry: AgentToolRegistry
  private readonly repository: AgentOrchestratorOptions['repository']
  private readonly stockIdentity: AgentOrchestratorOptions['stockIdentity']
  private readonly maxCycles: number
  private readonly newsToolName = 'search_stock_news'

  constructor(options: AgentOrchestratorOptions) {
    this.provider = options.provider
    this.registry = options.registry
    this.repository = options.repository
    this.stockIdentity = options.stockIdentity
    this.maxCycles = options.maxCycles ?? DEFAULT_MAX_CYCLES
  }

  async run(input: AgentOrchestratorInput): Promise<AgentOrchestratorResult> {
    const thread = await this.repository.findThread(input.userId, input.threadId)
    if (!thread) throw new AgentToolOwnershipError('资源不存在')

    const controller = new AbortController()
    const deadlineMs = input.deadlineMs ?? DEFAULT_DEADLINE_MS
    const timer = setTimeout(() => controller.abort(new AgentTimeoutError()), deadlineMs)
    if (input.signal) {
      const external = input.signal
      if (external.aborted) controller.abort(external.reason)
      else external.addEventListener('abort', () => controller.abort(external.reason), { once: true })
    }

    const collectedToolCalls: AgentToolCall[] = []
    const collectedCitations: AgentCitation[] = []
    const newsCitations: AgentCitation[] = []
    let newsSearchUnavailable = false
    let firstContentSeen = false

    try {
      const context = await buildAgentContext({
        run: input.run,
        userId: input.userId,
        stockId: input.stockId,
        threadId: input.threadId,
        repository: this.repository as never,
        stockIdentity: this.stockIdentity,
        tools: this.toProviderToolDefinitions(this.registry.definitions()),
      })

      const transcript: AgentStandardMessage[] = [...context.messages]
      let toolBearingCycles = 0
      let finalContent = ''

      for (let cycle = 1; cycle <= this.maxCycles; cycle += 1) {
        const turn = await this.provider.generate({
          model: input.run.model,
          messages: transcript,
          tools: this.toProviderToolDefinitions(this.registry.definitions()),
          signal: controller.signal,
          traceId: input.run.id,
        })

        if (turn.toolCalls.length > 0) {
          toolBearingCycles += 1
          transcript.push({
            role: 'assistant',
            content: turn.content,
            toolCalls: turn.toolCalls,
          })

          for (const call of turn.toolCalls) {
            const executed = await this.executeToolCall({
              run: input.run,
              call,
              userId: input.userId,
              stockId: input.stockId,
              threadId: input.threadId,
              signal: controller.signal,
            })
            collectedToolCalls.push(executed)
            if (call.name === this.newsToolName) {
              const payload = executed.result as { citations?: AgentCitation[]; searchUnavailable?: boolean } | null
              if (payload?.searchUnavailable) {
                newsSearchUnavailable = true
              } else if (Array.isArray(payload?.citations)) {
                for (const citation of payload.citations) newsCitations.push(citation)
              }
            }
            transcript.push({
              role: 'tool',
              content: executed.errorCode
                ? `工具 ${call.name} 失败：${executed.errorCode}`
                : truncateJson(executed.result, MAX_TOOL_RESULT_LENGTH),
              toolCallId: call.id,
            })
          }
          if (cycle === this.maxCycles) {
            throw new AgentToolLimitError()
          }
          continue
        }

        finalContent = turn.content
        firstContentSeen = true
        for (const citation of turn.citations) {
          collectedCitations.push(citation)
        }
        break
      }

      if (!firstContentSeen) {
        finalContent = ''
      }

      const verifiedCitations = dedupeCitations(newsCitations)
      if (newsSearchUnavailable && !/本次联网资料获取失败/.test(finalContent)) {
        finalContent = finalContent
          ? `${finalContent}\n本次联网资料获取失败，回答仅基于本地研究记录。`
          : '本次联网资料获取失败，回答仅基于本地研究记录。'
      }

      return {
        content: finalContent,
        citations: verifiedCitations,
        toolCalls: collectedToolCalls,
      }
    } finally {
      clearTimeout(timer)
    }
  }

  private toProviderToolDefinitions(definitions: Array<{ name: string; description: string; parameters: Record<string, unknown> }>): ProviderToolDefinition[] {
    return definitions.map((definition) => ({
      name: definition.name,
      description: definition.description,
      inputSchema: definition.parameters,
    }))
  }

  private async executeToolCall(args: {
    run: AgentRun
    call: { id: string; name: string; arguments: Record<string, unknown> }
    userId: string
    stockId: string
    threadId: string
    signal: AbortSignal
  }): Promise<AgentToolCall> {
    const startedAt = Date.now()
    let status: AgentToolCall['status'] = 'running'
    let result: Record<string, unknown> | null = null
    let errorCode: string | null = null
    try {
      const stage: AgentRun['stage'] = args.call.name === this.newsToolName ? 'searching' : 'calling_tools'
      await this.repository.updateRunStage(args.run.id, stage)
      const output = await this.registry.execute(args.call.name, args.call.arguments, {
        userId: args.userId,
        stockId: args.stockId,
        threadId: args.threadId,
        runId: args.run.id,
        signal: args.signal,
      })
      result = output === undefined ? null : (output as Record<string, unknown>)
      status = 'completed'
    } catch (cause) {
      status = 'failed'
      errorCode = cause instanceof Error ? cause.message.slice(0, 100) : 'UNKNOWN'
    }
    const duration = Date.now() - startedAt
    const persisted = await this.repository.persistToolCall({
      id: `pending-${args.call.id}-${startedAt}`,
      runId: args.run.id,
      threadId: args.threadId,
      userId: args.userId,
      toolName: args.call.name,
      arguments: boundedArgs(args.call.arguments),
      result,
      status,
      errorCode,
      durationMs: duration,
      createdAt: new Date(startedAt).toISOString(),
      completedAt: new Date(startedAt + duration).toISOString(),
    })
    return persisted
  }
}

function truncateJson(value: unknown, maxLength: number): string {
  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    serialized = String(value)
  }
  if (serialized.length <= maxLength) return serialized
  return serialized.slice(0, maxLength)
}

function boundedArgs(args: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(truncateJson(args, 2000))
}

function dedupeCitations(citations: AgentCitation[]): AgentCitation[] {
  const seen = new Set<string>()
  const out: AgentCitation[] = []
  for (const citation of citations) {
    if (seen.has(citation.url)) continue
    seen.add(citation.url)
    out.push(citation)
  }
  return out
}

export type { AgentModelProvider, AgentTurnResult }