import OpenAI from 'openai'

/**
 * DeepSeek (OpenAI 兼容) 客户端工厂
 * - 模型/baseURL 写死常量,不再走环境变量
 * - API key 仍由环境变量 DEEPSEEK_API_KEY 提供,key 留空时所有 invoke 都会抛错
 */
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
export const DEEPSEEK_FLASH_MODEL = 'deepseek-v4-flash'
export const DEEPSEEK_PRO_MODEL = 'deepseek-v4-pro'

let _client: OpenAI | null = null

function getClient(): OpenAI {
  if (_client) return _client
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY 未配置,无法调用 DeepSeek')
  }
  _client = new OpenAI({
    apiKey,
    baseURL: DEEPSEEK_BASE_URL,
  })
  return _client
}

export interface DeepseekChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface DeepseekInvokeOptions {
  model?: string
  temperature?: number
  maxTokens?: number
}

export async function deepseekChat(
  messages: DeepseekChatMessage[],
  opts: DeepseekInvokeOptions = {},
): Promise<string> {
  const client = getClient()
  const res = await client.chat.completions.create({
    model: opts.model || DEEPSEEK_FLASH_MODEL,
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens,
  })
  return res.choices[0]?.message?.content?.trim() ?? ''
}
