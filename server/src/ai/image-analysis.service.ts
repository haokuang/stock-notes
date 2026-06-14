import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import OpenAI from 'openai'
import {
  getVisionConfig,
  ImageAnalysisResult,
  parseImageAnalysis,
} from './image-analysis'

@Injectable()
export class ImageAnalysisService {
  async analyze(imageUrl: string, prompt: string): Promise<ImageAnalysisResult> {
    const config = getVisionConfig(process.env)
    if (!config) {
      throw new ServiceUnavailableException('视觉模型未配置')
    }

    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    })
    const completion = await client.chat.completions.create({
      model: config.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: '你是严谨的证券图片分析助手。只基于图片中可见信息作答，不确定时明确说明。返回 JSON，字段为 summary、key_points、sentiment、confidence。sentiment 仅可为 bull、bear、neutral，confidence 范围 0 到 1。',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
    })
    const content = completion.choices[0]?.message?.content ?? ''
    return parseImageAnalysis(content, imageUrl)
  }
}
