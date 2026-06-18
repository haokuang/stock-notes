import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migration = readFileSync(
  path.resolve(__dirname, '../../migrations/0009_agent_core.sql'),
  'utf8',
)

test('creates the four user-owned Agent tables', () => {
  for (const table of ['agent_threads', 'agent_messages', 'agent_runs', 'agent_tool_calls']) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`))
    assert.match(migration, new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`))
  }
})

test('enforces thread, request and active-run uniqueness', () => {
  assert.match(migration, /agent_threads_user_stock_uq[\s\S]*user_id, stock_id/)
  assert.match(migration, /agent_runs_user_request_uq[\s\S]*user_id, client_request_id/)
  assert.match(migration, /agent_runs_one_active_per_thread_uq[\s\S]*status IN \('queued', 'running'\)/)
  assert.match(migration, /max_attempts = 2/)
})

test('adds ownership policies with authenticated role and safe update checks', () => {
  for (const table of ['agent_threads', 'agent_messages', 'agent_runs', 'agent_tool_calls']) {
    assert.match(migration, new RegExp(`${table}_select_own[\\s\\S]*FOR SELECT[\\s\\S]*TO authenticated[\\s\\S]*auth\\.uid\\(\\)\\) = user_id`))
    assert.match(migration, new RegExp(`${table}_insert_own[\\s\\S]*FOR INSERT[\\s\\S]*TO authenticated[\\s\\S]*WITH CHECK`))
    assert.match(migration, new RegExp(`${table}_update_own[\\s\\S]*FOR UPDATE[\\s\\S]*TO authenticated[\\s\\S]*USING[\\s\\S]*WITH CHECK`))
    assert.match(migration, new RegExp(`${table}_delete_own[\\s\\S]*FOR DELETE[\\s\\S]*TO authenticated[\\s\\S]*USING`))
  }
})

test('publishes only run and message changes to authenticated clients', () => {
  assert.match(migration, /GRANT SELECT ON agent_runs, agent_messages TO authenticated/)
  assert.match(migration, /ALTER PUBLICATION supabase_realtime ADD TABLE agent_runs/)
  assert.match(migration, /ALTER PUBLICATION supabase_realtime ADD TABLE agent_messages/)
})

test('keeps saved reports while clearing deleted stock and run links', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS agent_run_id[\s\S]*REFERENCES agent_runs\(id\) ON DELETE SET NULL/)
  assert.match(migration, /ai_reports_agent_run_uq[\s\S]*WHERE agent_run_id IS NOT NULL/)
})
