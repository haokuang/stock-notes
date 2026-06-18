import assert from 'node:assert/strict'
import test from 'node:test'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { AgentController } from './agent.controller'
import { CreateAgentThreadDto, ListAgentMessagesQuery, StockIdQuery } from './agent.dto'
import { AgentService } from './agent.service'

test('validates required stock id and clamps message limit', async () => {
  const invalid = Object.assign(new CreateAgentThreadDto(), { stock_id: '' })
  assert.ok((await validate(invalid)).length > 0)

  const stockQuery = plainToInstance(StockIdQuery, { stock_id: ' stock-1 ' })
  assert.equal(stockQuery.stock_id, 'stock-1')

  const query = Object.assign(new ListAgentMessagesQuery(), { limit: '999' })
  assert.equal(query.normalizedLimit, 50)
})

test('returns one data envelope for batch-one routes', async () => {
  const thread = { id: 'thread-1' }
  const repository = {
    findThreadByStock: async () => thread,
    getOrCreateThread: async () => thread,
    findThread: async () => thread,
    listMessages: async () => ({ items: [], nextCursor: null }),
    findRun: async () => ({ id: 'run-1' }),
    listReports: async () => [],
  }
  const health = { snapshot: () => ({}) }
  const service = new AgentService(repository as never, health as never)
  const controller = new AgentController(service)

  assert.deepEqual(await controller.getThread({ id: 'user-1' }, 'stock-1'), { data: thread })
  assert.deepEqual(
    await controller.createThread({ id: 'user-1' }, Object.assign(new CreateAgentThreadDto(), { stock_id: 'stock-1' })),
    { data: thread },
  )
  assert.deepEqual(await controller.getRun({ id: 'user-1' }, 'run-1'), { data: { id: 'run-1' } })
  assert.equal('sendMessage' in controller, false)
})

test('normalizes non-owned thread and run reads to 404', async () => {
  const repository = {
    findThreadByStock: async () => null,
    getOrCreateThread: async () => { throw new Error('Stock not found') },
    findThread: async () => null,
    listMessages: async () => ({ items: [], nextCursor: null }),
    findRun: async () => null,
    listReports: async () => [],
  }
  const health = { snapshot: () => ({}) }
  const service = new AgentService(repository as never, health as never)

  await assert.rejects(service.getMessages('user-2', 'thread-1', null, 20), /资源不存在/)
  await assert.rejects(service.getRun('user-2', 'run-1'), /资源不存在/)
  await assert.rejects(service.createThread('user-2', 'stock-1'), /资源不存在/)
})
