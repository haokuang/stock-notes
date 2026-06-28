import assert from 'node:assert/strict'
import test from 'node:test'
import { MiniMaxSearchClient } from './minimax-search.client'

function makeRunner(
  result: { stdout?: string; stderr?: string; reject?: Error } = {},
) {
  const calls: Array<{
    file: string
    args: string[]
    options: {
      env?: NodeJS.ProcessEnv
      signal?: AbortSignal
      timeout?: number
      maxBuffer?: number
    }
  }> = []
  return {
    calls,
    run: async (
      file: string,
      args: string[],
      options: {
        env?: NodeJS.ProcessEnv
        signal?: AbortSignal
        timeout?: number
        maxBuffer?: number
      },
    ) => {
      calls.push({ file, args, options })
      if (result.reject) throw result.reject
      return { stdout: result.stdout ?? '{"results":[]}', stderr: result.stderr ?? '' }
    },
  }
}

test('MiniMaxSearchClient uses mmx search query with explicit CLI credentials', async () => {
  const runner = makeRunner({
    stdout: JSON.stringify({
      results: [{ title: 'A', url: 'https://example.com/a', content: 'snippet', published_date: '2026-06-27' }],
    }),
  })
  const client = new MiniMaxSearchClient({
    apiKey: 'secret-key',
    cliPath: 'local-mmx',
    region: 'cn',
    runner: runner.run,
  })

  const result = await client.search({ query: '兆易创新 最新消息', maxResults: 12 })

  assert.equal(result.results.length, 1)
  assert.equal(runner.calls[0].file, 'local-mmx')
  assert.deepEqual(runner.calls[0].args, [
    'search',
    'query',
    '--q',
    '兆易创新 最新消息',
    '--api-key',
    'secret-key',
    '--region',
    'cn',
    '--output',
    'json',
    '--quiet',
    '--non-interactive',
  ])
})

test('MiniMaxSearchClient uses bundled mmx-cli when no explicit CLI path is configured', async () => {
  const runner = makeRunner()
  const client = new MiniMaxSearchClient({ apiKey: 'key', runner: runner.run })

  await client.search({ query: 'q' })

  assert.equal(runner.calls[0].file, process.execPath)
  assert.match(runner.calls[0].args[0], /mmx-cli\/dist\/mmx\.mjs$/)
  assert.deepEqual(runner.calls[0].args.slice(1, 4), ['search', 'query', '--q'])
})

test('MiniMaxSearchClient clamps parsed results to 8 and drops items without url', async () => {
  const results = Array.from({ length: 12 }, (_, index) => ({
    title: `title-${index}`,
    url: index === 2 ? '' : `https://example.com/${index}`,
    content: `content-${index}`,
    published_date: null,
  }))
  const runner = makeRunner({ stdout: JSON.stringify({ data: { results } }) })
  const client = new MiniMaxSearchClient({ apiKey: 'key', runner: runner.run })

  const result = await client.search({ query: 'q', maxResults: 20 })

  assert.equal(result.results.length, 8)
  assert.equal(result.results[0].url, 'https://example.com/0')
  assert.ok(result.results.every((item) => item.url.length > 0))
})

test('MiniMaxSearchClient parses common MiniMax search JSON result fields', async () => {
  const runner = makeRunner({
    stdout: JSON.stringify({
      results: [{
        name: '标题',
        link: 'https://example.com/news',
        snippet: '摘要',
        publishedAt: '2026-06-27T00:00:00Z',
      }],
    }),
  })
  const client = new MiniMaxSearchClient({ apiKey: 'key', runner: runner.run })

  const result = await client.search({ query: 'q' })

  assert.deepEqual(result.results, [{
    title: '标题',
    url: 'https://example.com/news',
    content: '摘要',
    published_date: '2026-06-27T00:00:00Z',
  }])
})

test('MiniMaxSearchClient parses actual mmx organic search output fields', async () => {
  const runner = makeRunner({
    stdout: JSON.stringify({
      organic: [{
        title: '新闻标题',
        link: 'https://example.com/organic',
        snippet: '新闻摘要',
        date: '2026-06-27',
      }],
    }),
  })
  const client = new MiniMaxSearchClient({ apiKey: 'key', runner: runner.run })

  const result = await client.search({ query: 'q' })

  assert.deepEqual(result.results, [{
    title: '新闻标题',
    url: 'https://example.com/organic',
    content: '新闻摘要',
    published_date: '2026-06-27',
  }])
})

test('MiniMaxSearchClient normalizes provider base URL before passing it to mmx', async () => {
  const runner = makeRunner()
  const client = new MiniMaxSearchClient({
    apiKey: 'key',
    baseURL: 'https://api.minimaxi.com/v1/',
    runner: runner.run,
  })

  await client.search({ query: 'q' })

  assert.deepEqual(
    runner.calls[0].args.slice(runner.calls[0].args.indexOf('--base-url'), runner.calls[0].args.indexOf('--base-url') + 2),
    ['--base-url', 'https://api.minimaxi.com'],
  )
})

test('MiniMaxSearchClient reports missing credentials as search unavailable', async () => {
  const runner = makeRunner()
  const client = new MiniMaxSearchClient({ apiKey: '', runner: runner.run })

  await assert.rejects(client.search({ query: 'q' }), (cause: unknown) => {
    assert.equal((cause as { searchUnavailable?: boolean }).searchUnavailable, true)
    assert.match((cause as Error).message, /未配置/)
    return true
  })
  assert.equal(runner.calls.length, 0)
})

test('MiniMaxSearchClient reports CLI failure as search unavailable without leaking stderr', async () => {
  const runner = makeRunner({
    reject: Object.assign(new Error('Command failed: mmx\nraw provider details'), { code: 3 }),
  })
  const client = new MiniMaxSearchClient({ apiKey: 'key', runner: runner.run })

  await assert.rejects(client.search({ query: 'q' }), (cause: unknown) => {
    assert.equal((cause as { searchUnavailable?: boolean }).searchUnavailable, true)
    assert.doesNotMatch((cause as Error).message, /raw provider details/)
    return true
  })
})
