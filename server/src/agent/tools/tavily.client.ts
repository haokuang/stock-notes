export interface TavilyClientOptions {
  apiKey: string
  baseURL?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  maxResults?: number
  now?: () => number
}

export interface TavilySearchInput {
  query: string
  signal?: AbortSignal
  maxResults?: number
}

export interface TavilySearchOutput {
  results: TavilySearchResultItem[]
}

export interface TavilySearchResultItem {
  title: string
  url: string
  content: string
  published_date: string | null
}

export class TavilyUnavailableError extends Error {
  readonly searchUnavailable = true as const
  constructor(message: string) {
    super(message)
    this.name = 'TavilyUnavailableError'
  }
}

interface TavilyApiResponse {
  results?: Array<{
    title?: string
    url?: string
    content?: string
    published_date?: string | null
  }>
}

export class TavilyClient {
  private readonly apiKey: string
  private readonly baseURL: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly maxResults: number

  constructor(options: TavilyClientOptions) {
    if (!options.apiKey) throw new Error('Tavily api key is required')
    this.apiKey = options.apiKey
    this.baseURL = (options.baseURL ?? 'https://api.tavily.com').replace(/\/$/, '')
    this.fetchImpl = options.fetchImpl ?? fetch
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.maxResults = options.maxResults ?? 8
  }

  async search(input: TavilySearchInput): Promise<TavilySearchOutput> {
    const maxResults = Math.max(1, Math.min(8, Math.trunc(input.maxResults ?? this.maxResults)))
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('TAVILY_TIMEOUT')), this.timeoutMs)
    if (input.signal) {
      input.signal.addEventListener('abort', () => controller.abort(input.signal?.reason))
    }
    try {
      const response = await this.fetchImpl(`${this.baseURL}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          api_key: this.apiKey,
          query: input.query,
          max_results: maxResults,
          include_answer: false,
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new TavilyUnavailableError(`Tavily HTTP ${response.status}`)
      }
      const payload = (await response.json()) as TavilyApiResponse
      const raw = Array.isArray(payload.results) ? payload.results : []
      const results: TavilySearchResultItem[] = []
      for (const item of raw.slice(0, maxResults)) {
        if (!item || typeof item.url !== 'string' || item.url.length === 0) continue
        results.push({
          title: typeof item.title === 'string' ? item.title : '',
          url: item.url,
          content: typeof item.content === 'string' ? item.content : '',
          published_date: typeof item.published_date === 'string' ? item.published_date : null,
        })
      }
      return { results }
    } catch (cause) {
      if (cause instanceof TavilyUnavailableError) throw cause
      throw new TavilyUnavailableError(
        cause instanceof Error && cause.message === 'TAVILY_TIMEOUT'
          ? 'Tavily 搜索超时'
          : `Tavily 调用失败: ${cause instanceof Error ? cause.message : 'unknown'}`,
      )
    } finally {
      clearTimeout(timer)
    }
  }
}