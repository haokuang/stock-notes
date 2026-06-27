import assert from 'node:assert/strict'
import test from 'node:test'
import { createDatabasePoolConfig } from './connection-config'

test('builds the configured Supabase pooler URL from the database password', () => {
  const config = createDatabasePoolConfig({
    SUPABASE_DB_PASSWORD: 'password with symbols/@',
    DB_CONNECTION_PROFILE: 'pooler-transaction',
  })

  assert.equal(
    config.connectionString,
    'postgresql://postgres.hgpxchebcipynrfjssiq:password%20with%20symbols%2F%40@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=no-verify',
  )
  assert.deepEqual(config.ssl, { rejectUnauthorized: false })
})

test('uses a legacy full database URL directly', () => {
  const url = 'postgresql://postgres:secret@db.example.test:5432/postgres'
  const config = createDatabasePoolConfig({ SUPABASE_DB_URL: url })

  assert.equal(config.connectionString, url)
})

test('prefers DATABASE_URL over Supabase-specific database settings', () => {
  const url = 'postgresql://postgres:secret@database-url.example.test:5432/postgres'
  const config = createDatabasePoolConfig({
    DATABASE_URL: url,
    SUPABASE_DB_URL: 'postgresql://postgres:secret@supabase-url.example.test:5432/postgres',
    SUPABASE_DB_PASSWORD: 'supabase-password',
    DB_CONNECTION_PROFILE: 'pooler-session',
  })

  assert.equal(config.connectionString, url)
})

test('allows disabling SSL for an explicit database URL', () => {
  const url = 'postgresql://postgres:secret@aliyun-rds.example.test:5432/supabase_db'
  const config = createDatabasePoolConfig({
    SUPABASE_DB_URL: url,
    DATABASE_SSL: 'false',
  })

  assert.equal(config.connectionString, url)
  assert.equal(config.ssl, false)
})

test('prefers a full Supabase database URL over a profile password', () => {
  const url = 'postgresql://postgres:secret@db.example.test:5432/postgres'
  const config = createDatabasePoolConfig({
    SUPABASE_DB_PASSWORD: 'preferred-password',
    SUPABASE_DB_URL: url,
    DB_CONNECTION_PROFILE: 'pooler-session',
  })

  assert.equal(config.connectionString, url)
})

test('rejects an unknown database connection profile', () => {
  assert.throws(
    () =>
      createDatabasePoolConfig({
        SUPABASE_DB_PASSWORD: 'secret',
        DB_CONNECTION_PROFILE: 'unknown',
      }),
    /Unknown DB_CONNECTION_PROFILE/,
  )
})

test('reports missing database credentials without exposing values', () => {
  assert.throws(
    () => createDatabasePoolConfig({}),
    /DATABASE_URL.*SUPABASE_DB_URL.*SUPABASE_DB_PASSWORD/,
  )
})
