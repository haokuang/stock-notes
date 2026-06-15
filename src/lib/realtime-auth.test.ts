import assert from 'node:assert/strict'
import test from 'node:test'
import { syncRealtimeAuth } from './realtime-auth'

test('sets the current user JWT on Realtime', () => {
  const calls: unknown[][] = []
  const realtime = {
    setAuth: (...args: unknown[]) => {
      calls.push(args)
    },
  }

  syncRealtimeAuth(realtime, 'access-token')

  assert.deepEqual(calls, [['access-token']])
})

test('returns Realtime to client-managed anonymous auth after logout', () => {
  const calls: unknown[][] = []
  const realtime = {
    setAuth: (...args: unknown[]) => {
      calls.push(args)
    },
  }

  syncRealtimeAuth(realtime, null)

  assert.deepEqual(calls, [[]])
})
