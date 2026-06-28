export interface SearchClientInput {
  query: string
  signal?: AbortSignal
  maxResults?: number
}

export interface SearchClientOutput {
  results: SearchResultItem[]
}

export interface SearchResultItem {
  title: string
  url: string
  content: string
  published_date: string | null
}

export interface SearchClient {
  search(input: SearchClientInput): Promise<SearchClientOutput>
}

export class SearchUnavailableError extends Error {
  readonly searchUnavailable = true as const

  constructor(message: string) {
    super(message)
    this.name = 'SearchUnavailableError'
  }
}
