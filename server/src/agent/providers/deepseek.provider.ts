import OpenAI from 'openai'
import { OpenAICompatibleProvider } from './openai-compatible'

export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, baseURL: string, model: string) {
    super('deepseek', new OpenAI({ apiKey, baseURL }), model)
  }
}
