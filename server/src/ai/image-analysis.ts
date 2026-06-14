export interface ImageAnalysisResult {
  summary: string
  key_points: string[]
  sentiment: 'bull' | 'bear' | 'neutral'
  confidence: number
  image_url: string
  mock: false
}

export interface VisionEnvironment {
  [key: string]: string | undefined
  VISION_API_KEY?: string
  VISION_BASE_URL?: string
  VISION_MODEL?: string
}

export interface VisionConfig {
  apiKey: string
  baseURL: string
  model: string
}

export function getVisionConfig(env: VisionEnvironment): VisionConfig | null {
  const apiKey = env.VISION_API_KEY?.trim()
  const baseURL = env.VISION_BASE_URL?.trim()
  const model = env.VISION_MODEL?.trim()
  if (!apiKey || !baseURL || !model) return null
  return { apiKey, baseURL, model }
}

export function parseImageAnalysis(content: string, imageUrl: string): ImageAnalysisResult {
  const jsonText = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  const parsed = JSON.parse(jsonText) as Record<string, unknown>
  const summary = String(parsed.summary ?? parsed.description ?? '').trim()
  const rawPoints = parsed.key_points ?? parsed.keyPoints
  const keyPoints = Array.isArray(rawPoints)
    ? rawPoints.map((point) => String(point).trim()).filter(Boolean).slice(0, 8)
    : []
  const rawSentiment = String(parsed.sentiment ?? 'neutral')
  const sentiment = rawSentiment === 'bull' || rawSentiment === 'bear'
    ? rawSentiment
    : 'neutral'
  const rawConfidence = Number(parsed.confidence)
  const confidence = Number.isFinite(rawConfidence)
    ? Math.min(1, Math.max(0, rawConfidence))
    : 0.5

  if (!summary) {
    throw new Error('视觉模型未返回有效摘要')
  }

  return {
    summary,
    key_points: keyPoints,
    sentiment,
    confidence,
    image_url: imageUrl,
    mock: false,
  }
}
