import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migration = readFileSync(
  path.resolve(__dirname, '../../migrations/0013_wechat_accounts.sql'),
  'utf8',
)

test('creates user-owned wechat_accounts with openid uniqueness and RLS', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS wechat_accounts/)
  assert.match(migration, /user_id\s+UUID NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/)
  assert.match(migration, /openid\s+VARCHAR\(64\) NOT NULL/)
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS wechat_accounts_openid_uq/)
  assert.match(migration, /CREATE INDEX IF NOT EXISTS wechat_accounts_user_id_idx/)
  assert.match(migration, /ALTER TABLE wechat_accounts ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /wechat_accounts_select_own/)
  assert.match(migration, /wechat_accounts_insert_own/)
  assert.match(migration, /wechat_accounts_update_own/)
  assert.match(migration, /wechat_accounts_delete_own/)
  assert.match(migration, /wechat_accounts_set_updated_at/)
})
