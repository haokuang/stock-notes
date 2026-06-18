import type { AgentProvider } from '../agent.types'
import { normalizeProviderError, ProviderError } from './provider-error'
import type {
  AgentModelProvider,
  AgentProviderRequest,
  AgentProviderToolCall,
  AgentStandardMessage,
  ProviderHealth,
} from './provider.types'

/**
 * Minimal structural type for the slice of the OpenAI SDK we depend on.
 * Intentionally does not constrain parameter shapes — the SDK exposes
 * overloaded `create` signatures (streaming / non-streaming / base) and
 * TypeScript's function parameter contravariance would reject a wide
 * declaration like `Record<string, unknown>` against the SDK's narrow
 * `ChatCompletionCreateParams*` overloads.
 *
 * Callers must construct a real `OpenAI` instance; the structural shape
 * here only guarantees the `chat.completions.create` method we use exists.
 * `body` and `options` are typed as `any` at the boundary so we don't
 * fight the SDK's overload set inside this module.
 */
interface CompatibleClient {
  chat: {
    completions: {
      create(body: any, options?: any): Promise<any>
    }
  }
}

function mapMessage(message: AgentStandardMessage): Record<string, unknown> {
  if (message.role === 'tool') {
    return { role: 'tool', content: message.content, tool_call_id: message.toolCallId }
  }
  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'assistant',
      content: message.content,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: JSON.stringify(call.arguments) },
      })),
    }
  }
  return { role: message.role, content: message.content }
}

function mapToolCalls(provider: AgentProvider, calls: any[] | undefined): AgentProviderToolCall[] {
  return (calls ?? []).map((call) => {
    try {
      const args = JSON.parse(call.function.arguments || '{}')
      if (typeof args !== 'object' || args === null || Array.isArray(args)) throw new Error()
      return { id: call.id, name: call.function.name, arguments: args }
    } catch (cause) {
      throw new ProviderError(provider, 'PROVIDER_INVALID_REQUEST', false, '模型返回了无效的工具参数', null, { cause })
    }
  })
}

export class OpenAICompatibleProvider implements AgentModelProvider {
  constructor(
    readonly provider: AgentProvider,
    private readonly client: CompatibleClient,
    private readonly defaultModel: string,
  ) {}

  async generate(request: AgentProviderRequest) {
    try {
      const body: Record<string, unknown> = {
        model: request.model,
        messages: request.messages.map(mapMessage),
      }
      if (request.tools.length) {
        body.tools = request.tools.map((tool) => ({
          type: 'function',
          function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
        }))
        body.tool_choice = 'auto'
      }
      const response = await this.client.chat.completions.create(body, { signal: request.signal })
      const message = response.choices?.[0]?.message
      const usage = response.usage
      return {
        content: typeof message?.content === 'string' ? message.content : '',
        toolCalls: mapToolCalls(this.provider, message?.tool_calls),
        citations: [],
        providerMetadata: {
          responseId: response.id,
          ...(usage ? { usage: {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
          } } : {}),
        },
      }
    } catch (error) {
      throw normalizeProviderError(this.provider, error)
    }
  }

  async checkHealth(): Promise<ProviderHealth> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    try {
      await this.client.chat.completions.create({
        model: this.defaultModel,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }, { signal: controller.signal })
      return { status: 'available', reason: null, retryAfter: null, checkedAt: new Date().toISOString() }
    } catch (input) {
      const error = normalizeProviderError(this.provider, input)
      return {
        status: error.code === 'PROVIDER_RATE_LIMITED' ? 'rate_limited' : 'unavailable',
        reason: error.safeMessage,
        retryAfter: error.retryAfter,
        checkedAt: new Date().toISOString(),
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
