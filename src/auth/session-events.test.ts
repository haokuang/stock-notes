import assert from 'node:assert/strict'
import test from 'node:test'
import { createSessionEvents } from './session-events'

test('notifies subscribers when an access token changes or clears', () => {
  const events = createSessionEvents()
  const received: Array<string | null> = []
  const unsubscribe = events.subscribe((accessToken) => received.push(accessToken))

  events.emit('token-1')
  events.emit('token-2')
  events.emit(null)
  unsubscribe()
  events.emit('ignored')

  assert.deepEqual(received, ['token-1', 'token-2', null])
})
