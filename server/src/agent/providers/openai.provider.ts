import OpenAI from 'openai'
import { OpenAICompatibleProvider } from './openai-compatible'

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, model: string) {
    super('openai', new OpenAI({ apiKey }), model)
  }
}
