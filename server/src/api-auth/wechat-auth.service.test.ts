import assert from 'node:assert/strict'
import { mock, test, beforeEach, afterEach } from 'node:test'
import { WechatAuthService } from './wechat-auth.service'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type * as schema from '../storage/database/shared/schema'

// ── mock 工厂 ────────────────────────────────────────────────

function createMockDrizzle(selectResult: any[] = [], updateResult: any[] = []) {
  // select 链:.select().from().where().limit() → Promise<array>
  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    limit: () => Promise.resolve(selectResult),
  }
  // update 链:.update().set().where().returning() → Promise<array>
  const updateChain = {
    set: () => updateChain,
    where: () => updateChain,
    returning: () => Promise.resolve(updateResult),
  }
  const db: any = {
    select: () => selectChain,
    insert: () => ({ values: () => Promise.resolve() }),
    update: () => updateChain,
  }
  return db as unknown as NodePgDatabase<typeof schema>
}

function createMockSupabaseClient(options: {
  createUser?: any
  generateLink?: any
  verifyOtp?: any
} = {}): SupabaseClient {
  const noop = () => Promise.resolve({ data: {}, error: null })
  return {
    auth: {
      admin: {
        createUser: options.createUser ?? noop,
        generateLink: options.generateLink ?? noop,
      },
      getUser: noop,
      verifyOtp: options.verifyOtp ?? noop,
    },
  } as unknown as SupabaseClient
}

// ── fetch mock ──────────────────────────────────────────────

const originalFetch = global.fetch

function mockFetch(response: any) {
  global.fetch = (() =>
    Promise.resolve({
      json: () => Promise.resolve(response),
    })) as unknown as typeof fetch
}

beforeEach(() => {
  // 注入微信环境变量
  process.env.WECHAT_APPID = 'wxtestappid'
  process.env.WECHAT_SECRET = 'test-secret'
})

afterEach(() => {
  global.fetch = originalFetch
})

// ── 测试 ─────────────────────────────────────────────────────

test('new user first login: code2session → createUser → insert → verifyOtp → session', async () => {
  // code2session 返回 openid
  mockFetch({ openid: 'openid-new-user', session_key: 'sk', unionid: 'uid' })

  // select 查不到已有记录(空数组)
  const db = createMockDrizzle([], [])

  // admin client: createUser 成功
  const adminClient = createMockSupabaseClient({
    createUser: () =>
      Promise.resolve({
        data: { user: { id: 'supabase-user-uuid', email: 'wx_openid-new-user@wechat.local' } },
        error: null,
      }),
    generateLink: () =>
      Promise.resolve({
        data: {
          properties: { hashed_token: 'hashed-token-123' },
          user: { id: 'supabase-user-uuid' },
        },
        error: null,
      }),
  })

  // anon client: verifyOtp 成功返回 session
  const anonClient = createMockSupabaseClient({
    verifyOtp: () =>
      Promise.resolve({
        data: {
          user: { id: 'supabase-user-uuid', email: 'wx_openid-new-user@wechat.local' },
          session: {
            access_token: 'access-token-abc',
            refresh_token: 'refresh-token-xyz',
            expires_in: 3600,
          },
        },
        error: null,
      }),
  })

  const service = new WechatAuthService(adminClient, anonClient, db)
  const result = await service.loginWithCode('valid-js-code')

  assert.equal(result.user.id, 'supabase-user-uuid')
  assert.equal(result.user.email, 'wx_openid-new-user@wechat.local')
  assert.equal(result.access_token, 'access-token-abc')
  assert.equal(result.refresh_token, 'refresh-token-xyz')
  assert.equal(result.expires_in, 3600)
})

test('existing user login: finds record, skips createUser, returns session', async () => {
  mockFetch({ openid: 'openid-existing', session_key: 'sk' })

  // select 查到已有记录
  const db = createMockDrizzle([{ user_id: 'existing-user-uuid' }], [])

  let createUserCalled = false
  const adminClient = createMockSupabaseClient({
    createUser: () => {
      createUserCalled = true
      return Promise.resolve({ data: {}, error: null })
    },
    generateLink: () =>
      Promise.resolve({
        data: { properties: { hashed_token: 'ht' }, user: { id: 'existing-user-uuid' } },
        error: null,
      }),
  })

  const anonClient = createMockSupabaseClient({
    verifyOtp: () =>
      Promise.resolve({
        data: {
          user: { id: 'existing-user-uuid', email: 'wx_openid-existing@wechat.local' },
          session: {
            access_token: 'at',
            refresh_token: 'rt',
            expires_in: 7200,
          },
        },
        error: null,
      }),
  })

  const service = new WechatAuthService(adminClient, anonClient, db)
  const result = await service.loginWithCode('some-code')

  assert.equal(result.user.id, 'existing-user-uuid')
  assert.equal(result.access_token, 'at')
  assert.equal(result.expires_in, 7200)
  // 不应调用 createUser
  assert.equal(createUserCalled, false)
})

test('code2session failure (errcode) throws UnauthorizedException', async () => {
  // 微信返回 errcode=40029 (invalid code)
  mockFetch({ errcode: 40029, errmsg: 'invalid code' })

  const db = createMockDrizzle()
  const adminClient = createMockSupabaseClient()
  const anonClient = createMockSupabaseClient()

  const service = new WechatAuthService(adminClient, anonClient, db)

  await assert.rejects(
    () => service.loginWithCode('bad-code'),
    (error: Error) => {
      assert.match(error.message, /code2session failed/)
      return true
    },
  )
})

test('generateLink failure throws InternalServerErrorException', async () => {
  mockFetch({ openid: 'openid-gl-fail' })

  const db = createMockDrizzle([], [])
  const adminClient = createMockSupabaseClient({
    createUser: () =>
      Promise.resolve({
        data: { user: { id: 'uid' } },
        error: null,
      }),
    generateLink: () =>
      Promise.resolve({
        data: null,
        error: { message: 'generate link exploded' },
      }),
  })
  const anonClient = createMockSupabaseClient()

  const service = new WechatAuthService(adminClient, anonClient, db)

  await assert.rejects(
    () => service.loginWithCode('code'),
    (error: Error) => {
      assert.match(error.message, /generateLink failed/)
      return true
    },
  )
})

test('verifyOtp failure throws UnauthorizedException', async () => {
  mockFetch({ openid: 'openid-vo-fail' })

  const db = createMockDrizzle([], [])
  const adminClient = createMockSupabaseClient({
    createUser: () =>
      Promise.resolve({ data: { user: { id: 'uid' } }, error: null }),
    generateLink: () =>
      Promise.resolve({
        data: { properties: { hashed_token: 'ht' }, user: { id: 'uid' } },
        error: null,
      }),
  })
  const anonClient = createMockSupabaseClient({
    verifyOtp: () =>
      Promise.resolve({
        data: null,
        error: { message: 'token expired' },
      }),
  })

  const service = new WechatAuthService(adminClient, anonClient, db)

  await assert.rejects(
    () => service.loginWithCode('code'),
    (error: Error) => {
      assert.match(error.message, /verifyOtp failed/)
      return true
    },
  )
})

test('getProfile returns nickname and avatar_url from db', async () => {
  const db = createMockDrizzle(
    [{ nickname: '微信用户', avatar_url: 'https://tos.example/avatar.jpg' }],
    [],
  )
  const adminClient = createMockSupabaseClient()
  const anonClient = createMockSupabaseClient()

  const service = new WechatAuthService(adminClient, anonClient, db)
  const profile = await service.getProfile('user-uuid')

  assert.equal(profile.nickname, '微信用户')
  assert.equal(profile.avatar_url, 'https://tos.example/avatar.jpg')
  assert.equal(profile.bound, true)
})

test('getProfile returns nulls when no record found', async () => {
  const db = createMockDrizzle([], [])
  const adminClient = createMockSupabaseClient()
  const anonClient = createMockSupabaseClient()

  const service = new WechatAuthService(adminClient, anonClient, db)
  const profile = await service.getProfile('user-uuid')

  assert.equal(profile.nickname, null)
  assert.equal(profile.avatar_url, null)
  assert.equal(profile.bound, false)
})

test('updateProfile patches nickname and avatar_url', async () => {
  const db = createMockDrizzle(
    [],
    [{ nickname: '新昵称', avatar_url: 'https://tos.example/new.jpg' }],
  )
  const adminClient = createMockSupabaseClient()
  const anonClient = createMockSupabaseClient()

  const service = new WechatAuthService(adminClient, anonClient, db)
  const result = await service.updateProfile('user-uuid', {
    nickname: '新昵称',
    avatar_url: 'https://tos.example/new.jpg',
  })

  assert.equal(result.nickname, '新昵称')
  assert.equal(result.avatar_url, 'https://tos.example/new.jpg')
  assert.equal(result.bound, true)
})

// ── bindWechat 测试 ──────────────────────────────────────────

test('bindWechat success: openid unbound → insert → returns null profile with bound=true', async () => {
  mockFetch({ openid: 'openid-to-bind', session_key: 'sk', unionid: 'uid' })

  // select 查 openid 未绑定(空数组);getProfile 也查不到(复用同一 mock)
  const db = createMockDrizzle([], [])
  const adminClient = createMockSupabaseClient()
  const anonClient = createMockSupabaseClient()

  const service = new WechatAuthService(adminClient, anonClient, db)
  const result = await service.bindWechat('email-user-uuid', 'valid-code')

  assert.equal(result.nickname, null)
  assert.equal(result.avatar_url, null)
  assert.equal(result.bound, true)
})

test('bindWechat idempotent: openid already bound to current user → returns profile, no insert', async () => {
  mockFetch({ openid: 'openid-already-mine' })

  // select 查到 openid 已绑定到当前用户
  const db = createMockDrizzle([{ user_id: 'email-user-uuid' }], [])
  const adminClient = createMockSupabaseClient()
  const anonClient = createMockSupabaseClient()

  const service = new WechatAuthService(adminClient, anonClient, db)
  const result = await service.bindWechat('email-user-uuid', 'some-code')

  assert.equal(result.bound, true)
})

test('bindWechat conflict: openid already bound to another user → throws ConflictException', async () => {
  mockFetch({ openid: 'openid-taken' })

  // select 查到 openid 已绑定到其他用户
  const db = createMockDrizzle([{ user_id: 'other-user-uuid' }], [])
  const adminClient = createMockSupabaseClient()
  const anonClient = createMockSupabaseClient()

  const service = new WechatAuthService(adminClient, anonClient, db)

  await assert.rejects(
    () => service.bindWechat('email-user-uuid', 'some-code'),
    (error: Error) => {
      assert.match(error.message, /已绑定其他账号/)
      return true
    },
  )
})

test('bindWechat code2session failure → throws UnauthorizedException', async () => {
  mockFetch({ errcode: 40029, errmsg: 'invalid code' })

  const db = createMockDrizzle()
  const adminClient = createMockSupabaseClient()
  const anonClient = createMockSupabaseClient()

  const service = new WechatAuthService(adminClient, anonClient, db)

  await assert.rejects(
    () => service.bindWechat('email-user-uuid', 'bad-code'),
    (error: Error) => {
      assert.match(error.message, /code2session failed/)
      return true
    },
  )
})
