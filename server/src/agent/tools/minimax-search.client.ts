import { execFile, type ExecFileOptions } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  SearchUnavailableError,
  type SearchClient,
  type SearchClientInput,
  type SearchClientOutput,
  type SearchResultItem,
} from './search.client'

export type MiniMaxSearchRunner = (
  file: string,
  args: string[],
  options: ExecFileOptions,
) => Promise<{ stdout: string; stderr: string }>

export interface MiniMaxSearchClientOptions {
  apiKey: string
  baseURL?: string
  cliPath?: string
  region?: string
  timeoutMs?: number
  maxResults?: number
  runner?: MiniMaxSearchRunner
}

type UnknownRecord = Record<string, unknown>

export class MiniMaxSearchClient implements SearchClient {
  private readonly apiKey: string
  private readonly baseURL: string
  private readonly cliFile: string
  private readonly cliArgsPrefix: string[]
  private readonly region: string
  private readonly timeoutMs: number
  private readonly maxResults: number
  private readonly runner: MiniMaxSearchRunner

  constructor(options: MiniMaxSearchClientOptions) {
    this.apiKey = options.apiKey.trim()
    this.baseURL = normalizeCliBaseURL(options.baseURL ?? process.env.MINIMAX_BASE_URL ?? '')
    const command = resolveCliCommand(options.cliPath)
    this.cliFile = command.file
    this.cliArgsPrefix = command.argsPrefix
    this.region = options.region?.trim() ?? ''
    this.timeoutMs = options.timeoutMs ?? 15_000
    this.maxResults = options.maxResults ?? 8
    this.runner = options.runner ?? runExecFile
  }

  async search(input: SearchClientInput): Promise<SearchClientOutput> {
    if (!this.apiKey) throw new SearchUnavailableError('MiniMax CLI 搜索未配置')
    const maxResults = Math.max(1, Math.min(8, Math.trunc(input.maxResults ?? this.maxResults)))
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('MINIMAX_SEARCH_TIMEOUT')), this.timeoutMs)
    const abortFromParent = () => controller.abort(input.signal?.reason)
    if (input.signal) {
      if (input.signal.aborted) abortFromParent()
      else input.signal.addEventListener('abort', abortFromParent, { once: true })
    }

    try {
      const { stdout } = await this.runner(this.cliFile, [
        ...this.cliArgsPrefix,
        'search',
        'query',
        '--q',
        input.query,
        '--api-key',
        this.apiKey,
        ...(this.baseURL ? ['--base-url', this.baseURL] : []),
        ...(this.region ? ['--region', this.region] : []),
        '--output',
        'json',
        '--quiet',
        '--non-interactive',
      ], {
        env: buildEnv({
          apiKey: this.apiKey,
          region: this.region,
          baseURL: this.baseURL,
        }),
        signal: controller.signal,
        timeout: this.timeoutMs,
        maxBuffer: 1024 * 1024,
      })
      const payload = parseJsonOutput(stdout)
      return { results: normalizeSearchResults(payload, maxResults) }
    } catch (cause) {
      if (cause instanceof SearchUnavailableError) throw cause
      const message = cause instanceof Error && cause.message === 'MINIMAX_SEARCH_TIMEOUT'
        ? 'MiniMax CLI 搜索超时'
        : 'MiniMax CLI 搜索调用失败'
      throw new SearchUnavailableError(message)
    } finally {
      clearTimeout(timer)
      if (input.signal) input.signal.removeEventListener('abort', abortFromParent)
    }
  }
}

function buildEnv(input: { apiKey: string; region: string; baseURL: string }): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, MINIMAX_API_KEY: input.apiKey }
  if (input.region) env.MINIMAX_REGION = input.region
  if (input.baseURL) env.MINIMAX_BASE_URL = input.baseURL
  return env
}

function runExecFile(
  file: string,
  args: string[],
  options: ExecFileOptions,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error)
        return
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) })
    })
  })
}

function parseJsonOutput(stdout: string): unknown {
  const trimmed = stdout.trim()
  if (!trimmed) return { results: [] }
  try {
    return JSON.parse(trimmed)
  } catch (cause) {
    throw new SearchUnavailableError('MiniMax CLI 搜索返回格式异常')
  }
}

function normalizeSearchResults(payload: unknown, maxResults: number): SearchResultItem[] {
  const raw = findResultArray(payload)
  const results: SearchResultItem[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const url = pickString(item, ['url', 'link', 'href'])
    if (!url) continue
    results.push({
      title: pickString(item, ['title', 'name']) ?? '',
      url,
      content: pickString(item, ['content', 'snippet', 'summary', 'description']) ?? '',
      published_date: pickString(item, ['published_date', 'publishedAt', 'published_at', 'date']) ?? null,
    })
    if (results.length >= maxResults) break
  }
  return results
}

function findResultArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!isRecord(payload)) return []
  const candidates = [
    payload.results,
    payload.items,
    payload.organic,
    isRecord(payload.data) ? payload.data.results : undefined,
    isRecord(payload.data) ? payload.data.items : undefined,
    isRecord(payload.data) ? payload.data.organic : undefined,
  ]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate
  }
  return []
}

function normalizeCliBaseURL(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return trimmed.replace(/\/v1$/i, '')
}

function resolveCliCommand(cliPath: string | undefined): { file: string; argsPrefix: string[] } {
  const explicit = cliPath?.trim()
  if (explicit) return { file: explicit, argsPrefix: [] }
  const localScript = findLocalMmxScript(process.cwd())
  if (localScript) return { file: process.execPath, argsPrefix: [localScript] }
  return { file: 'mmx', argsPrefix: [] }
}

function findLocalMmxScript(start: string): string | null {
  let current = resolve(start)
  for (;;) {
    const candidates = [
      join(current, 'node_modules', 'mmx-cli', 'dist', 'mmx.mjs'),
      join(current, 'server', 'node_modules', 'mmx-cli', 'dist', 'mmx.mjs'),
      join(current, 'node_modules', '.pnpm', 'node_modules', 'mmx-cli', 'dist', 'mmx.mjs'),
    ]
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate
    }
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null
}

function pickString(record: UnknownRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  }
  return null
}
