import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { attachPoolErrorLogger } from './database.module'

test('logs and absorbs idle pg pool errors', () => {
  const pool = new EventEmitter()
  const messages: unknown[] = []

  attachPoolErrorLogger(pool as never, {
    warn: (message: unknown) => messages.push(message),
  })

  assert.doesNotThrow(() => {
    pool.emit('error', new Error('Connection terminated unexpectedly'))
  })
  assert.equal(messages.length, 1)
  assert.match(String(messages[0]), /Database idle connection error ignored/)
  assert.match(String(messages[0]), /Connection terminated unexpectedly/)
})
