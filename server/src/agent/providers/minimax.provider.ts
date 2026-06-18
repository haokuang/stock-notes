import OpenAI from 'openai'
import { OpenAICompatibleProvider } from './openai-compatible'

export class MiniMaxProvider extends OpenAICompatibleProvider {
  constructor(apiKey: string, baseURL: string, model: string) {
    super('minimax', new OpenAI({ apiKey, baseURL }), model)
  }
}
