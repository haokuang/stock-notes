import assert from 'node:assert/strict'
import test from 'node:test'
import { createAuthenticatedRequester } from './authenticated-request'
import type { Session } from './session'

interface Option {
  url: string
}

interface Result {
  statusCode: number
  token: string | null
}

const initialSession: Session = {
  access_token: 'expired',
  refresh_token: 'refresh-1',
  user: { id: 'user-1', email: 'user@example.com' },
}

test('shares one refresh across concurrent 401 responses and retries both requests', async () => {
  let session: Session | null = initialSession
  let refreshCount = 0
  const requester = createAuthenticatedRequester<Option, Result>({
    send: async (_option, token) => ({
      statusCode: token === 'expired' ? 401 : 200,
      token,
    }),
    refresh: async () => {
      refreshCount += 1
      await new Promise((resolve) => setTimeout(resolve, 10))
      return { ...initialSession, access_token: 'fresh', refresh_token: 'refresh-2' }
    },
    getSession: () => session,
    setSession: (next) => { session = next },
    onUnauthorized: () => { session = null },
    isPublic: () => false,
  })

  const [first, second] = await Promise.all([
    requester({ url: '/api/notes' }),
    requester({ url: '/api/stocks' }),
  ])

  assert.equal(refreshCount, 1)
  assert.equal(first.statusCode, 200)
  assert.equal(second.statusCode, 200)
  assert.equal(first.token, 'fresh')
  assert.equal(second.token, 'fresh')
  assert.equal(session?.refresh_token, 'refresh-2')
})

test('clears the session when refresh fails', async () => {
  let session: Session | null = initialSession
  let unauthorizedCount = 0
  const requester = createAuthenticatedRequester<Option, Result>({
    send: async (_option, token) => ({ statusCode: 401, token }),
    refresh: async () => { throw new Error('invalid refresh token') },
    getSession: () => session,
    setSession: (next) => { session = next },
    onUnauthorized: () => {
      unauthorizedCount += 1
      session = null
    },
    isPublic: () => false,
  })

  const result = await requester({ url: '/api/notes' })

  assert.equal(result.statusCode, 401)
  assert.equal(unauthorizedCount, 1)
  assert.equal(session, null)
})
