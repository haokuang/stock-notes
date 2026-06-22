import assert from 'node:assert/strict'
import test from 'node:test'
import { StocksService } from './stocks.service'
import { MARKET_SUBJECT } from './stock-subject'

function makeDb(options: { existing?: boolean; duplicateOnInsert?: boolean } = {}) {
  const inserted: Record<string, unknown>[] = []
  return {
    inserted,
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => options.existing ? [{ id: 'market-1' }] : [],
        }),
      }),
    }),
    insert: () => ({
      values: (value: Record<string, unknown>) => {
        inserted.push(value)
        return {
          returning: async () => {
            if (options.duplicateOnInsert) {
              throw Object.assign(new Error('duplicate'), { code: '23505' })
            }
            return [{ id: 'market-1', ...value }]
          },
        }
      },
    }),
  }
}

function makeService(db: ReturnType<typeof makeDb>) {
  return new StocksService(
    db as never,
    { connect: async () => ({ release() {} }) } as never,
    { getListedOrdinaryStock: async () => null } as never,
  )
}

test('creates the fixed market subject without requesting market data', async () => {
  const db = makeDb()
  const created = await makeService(db).createMarket('user-1')
  assert.equal(created.code, MARKET_SUBJECT.code)
  assert.equal(created.name, MARKET_SUBJECT.name)
  assert.equal(created.subject_type, 'market')
  assert.deepEqual(db.inserted[0], {
    user_id: 'user-1',
    code: 'MARKET_A_SHARE',
    name: 'A股大盘',
    subject_type: 'market',
    industry: null,
    status: 'watching',
    sort_order: 0,
  })
})

test('maps both an existing row and a concurrent unique violation to one conflict', async () => {
  await assert.rejects(
    () => makeService(makeDb({ existing: true })).createMarket('user-1'),
    /市场大盘已在自选中/,
  )
  await assert.rejects(
    () => makeService(makeDb({ duplicateOnInsert: true })).createMarket('user-1'),
    /市场大盘已在自选中/,
  )
})
