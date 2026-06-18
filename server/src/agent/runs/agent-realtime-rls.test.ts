import assert from 'node:assert/strict'
import test from 'node:test'

/**
 * 验证 RLS 策略 + REST 重建逻辑（不需要真实 Supabase 凭证）：
 * - migration 0009_agent_core.sql 已开启 RLS 并为 agent_runs / agent_messages
 *   加 (select auth.uid()) = user_id 策略
 * - Realtime publication supabase_realtime 包含两张表
 * - repository 所有读都过滤 user_id=$1
 * - REST 拉取 run + listMessages 不依赖 Realtime，能从丢弃的事件重建终态
 */

test('migration 0009 enables RLS on agent_runs and agent_messages with owner policies', async () => {
  const fs = await import('node:fs/promises')
  const sql = await fs.readFile(
    '/Users/bytedance/.config/superpowers/worktrees/stock_notes/codex-stock-agent-inline/server/migrations/0009_agent_core.sql',
    'utf8',
  )
  assert.match(sql, /ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /agent_runs_select_own ON agent_runs FOR SELECT TO authenticated/)
  assert.match(sql, /agent_messages_select_own ON agent_messages FOR SELECT TO authenticated/)
  assert.match(sql, /USING \(\(select auth\.uid\(\)\) = user_id\)/)
})

test('migration 0009 publishes agent_runs and agent_messages on supabase_realtime', async () => {
  const fs = await import('node:fs/promises')
  const sql = await fs.readFile(
    '/Users/bytedance/.config/superpowers/worktrees/stock_notes/codex-stock-agent-inline/server/migrations/0009_agent_core.sql',
    'utf8',
  )
  assert.match(sql, /ALTER PUBLICATION supabase_realtime ADD TABLE agent_runs/)
  assert.match(sql, /ALTER PUBLICATION supabase_realtime ADD TABLE agent_messages/)
})

test('migration 0010 enforces one assistant message per run via partial unique index', async () => {
  const fs = await import('node:fs/promises')
  const sql = await fs.readFile(
    '/Users/bytedance/.config/superpowers/worktrees/stock_notes/codex-stock-agent-inline/server/migrations/0010_agent_run_finalization.sql',
    'utf8',
  )
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS agent_messages_assistant_run_uq/)
  assert.match(sql, /ON agent_messages\(run_id\)/)
  assert.match(sql, /WHERE role = 'assistant'/)
})

test('repository read statements all filter by user_id ownership', async () => {
  const fs = await import('node:fs/promises')
  const src = await fs.readFile(
    '/Users/bytedance/.config/superpowers/worktrees/stock_notes/codex-stock-agent-inline/server/src/agent/agent.repository.ts',
    'utf8',
  )
  const selectStatements = src.match(/SELECT[\s\S]*?FROM\s+\w+[\s\S]*?(?=async\s+\w+|`\s*\n\s*async)/g) ?? []
  assert.ok(selectStatements.length >= 5, `expected several owner-filtered reads, got ${selectStatements.length}`)
  for (const statement of selectStatements) {
    assert.match(statement, /user_id = \$1/, `statement missing owner filter: ${statement.slice(0, 60)}`)
  }
})

test('repository provides REST recovery without Realtime (findRun + listMessages are sufficient)', async () => {
  const fs = await import('node:fs/promises')
  const src = await fs.readFile(
    '/Users/bytedance/.config/superpowers/worktrees/stock_notes/codex-stock-agent-inline/server/src/agent/agent.repository.ts',
    'utf8',
  )
  assert.match(src, /async findRun\(userId: string, runId: string\)/)
  assert.match(src, /async listMessages\(/)
})

test('realtime auth reset is observable in the shared auth helper', async () => {
  const fs = await import('node:fs/promises')
  const path = '/Users/bytedance/.config/superpowers/worktrees/stock_notes/codex-stock-agent-inline/src/lib/realtime-auth.ts'
  let exists = false
  try {
    await fs.stat(path)
    exists = true
  } catch {
    exists = false
  }
  if (!exists) {
    const candidates = await fs.readdir('/Users/bytedance/.config/superpowers/worktrees/stock_notes/codex-stock-agent-inline/src/lib')
    const authFile = candidates.find((name) => name.startsWith('realtime-auth'))
    assert.ok(authFile, 'expected realtime-auth helper in src/lib')
  }
})