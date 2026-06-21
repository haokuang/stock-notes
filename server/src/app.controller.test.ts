import assert from 'node:assert/strict'
import test from 'node:test'
import { AppController } from './app.controller'

test('health response is stable and contains no configuration values', () => {
  const controller = new AppController({ getHello: () => 'hello' } as never)
  const response = controller.getHealth()

  assert.equal(response.status, 'success')
  assert.equal(response.data.status, 'ok')
  assert.match(response.data.timestamp, /^\d{4}-\d{2}-\d{2}T/)
  assert.deepEqual(Object.keys(response.data).sort(), ['status', 'timestamp'])
})
