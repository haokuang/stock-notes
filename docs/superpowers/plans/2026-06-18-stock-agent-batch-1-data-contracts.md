# Stock Agent Batch 1 Data Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the persistent, user-isolated data model and stable API/domain contracts required by every later Stock Agent batch without calling any model.

**Architecture:** A dedicated `server/src/agent` module owns camelCase domain types and maps PostgreSQL rows at its repository boundary. PostgreSQL constraints enforce thread uniqueness, request idempotency, one active run per thread, report provenance, and RLS; NestJS exposes only ownership-checked read/create endpoints.

**Tech Stack:** NestJS 10, PostgreSQL/Supabase, Drizzle ORM, `pg`, `class-validator`, Node test runner through `tsx`, pnpm.

---

## File Map

**Create**

- `server/migrations/0009_agent_core.sql`: four Agent tables, report provenance, indexes, RLS, policies, grants, and Realtime publication.
- `server/src/agent/agent.types.ts`: provider, status, stage, message, citation, run, and repository DTOs.
- `server/src/agent/agent.mapper.ts`: snake_case row to camelCase domain conversion.
- `server/src/agent/agent.repository.ts`: ownership-safe thread, message, run, and report reads/writes.
- `server/src/agent/agent.dto.ts`: validated API request/query DTOs.
- `server/src/agent/agent.service.ts`: use cases and 404 normalization.
- `server/src/agent/agent.controller.ts`: batch-1 HTTP routes.
- `server/src/agent/agent.module.ts`: module wiring.
- `server/src/agent/agent-migration.test.ts`: migration contract assertions.
- `server/src/agent/agent.repository.test.ts`: PostgreSQL behavior tests.
- `server/src/agent/agent-api.test.ts`: service/controller ownership and response tests.

**Modify**

- `server/src/storage/database/shared/schema.ts`: Drizzle models and inferred row types.
- `server/src/app.module.ts`: import `AgentModule`.
- `package.json`: add focused Agent batch-1 test command.

### Task 1: Lock the domain contract

**Files:** Create `server/src/agent/agent.types.ts`, `server/src/agent/agent.mapper.ts`, `server/src/agent/agent.types.test.ts`

- [ ] **Step 1: Write the failing mapper test**

Assert that a snake_case run row maps `retry_after` and timestamps to this public shape and that citations reject missing URLs:

```ts
export type AgentProvider = 'deepseek' | 'openai' | 'minimax'
export type AgentRunStatus = 'queued' | 'running' | 'completed' | 'failed'
export type AgentRunStage = 'queued' | 'loading_context' | 'calling_tools' | 'searching' | 'generating' | 'completed' | 'failed'
export type AgentCitation = { id: string; title: string; url: string; source: string; snippet: string; publishedAt: string | null }
export type AgentRun = {
  id: string; threadId: string; userMessageId: string; provider: AgentProvider; model: string
  credentialMode: 'api' | 'coding_plan' | null; status: AgentRunStatus; stage: AgentRunStage
  attemptCount: number; maxAttempts: number; errorCode: string | null; errorMessage: string | null
  retryAfter: number | null; createdAt: string; updatedAt: string
}
```

- [ ] **Step 2: Run RED**

Run `pnpm exec tsx --test --tsconfig=server/tsconfig.json server/src/agent/agent.types.test.ts`.
Expected: FAIL because the type and mapper modules do not exist.

- [ ] **Step 3: Implement the types and explicit mapper**

Export `AgentThread`, `AgentMessage`, `AgentRun`, `AgentToolCall`, `AgentReportSummary`, `MessagePage<T>` and row interfaces. Implement `mapAgentRunRow`, `mapAgentMessageRow`, and `parseCitations`; throw `Error('Invalid stored citation')` when `id`, `title`, or `url` is absent. Do not export SDK or Drizzle inferred types from this module.

- [ ] **Step 4: Run GREEN and commit**

Run the focused test and `pnpm build:server`; expect PASS. Commit with `git commit -m "feat: 定义 Agent 领域契约"`.

### Task 2: Add the database migration and Drizzle schema

**Files:** Create `server/migrations/0009_agent_core.sql`, `server/src/agent/agent-migration.test.ts`; modify `server/src/storage/database/shared/schema.ts`

- [ ] **Step 1: Write migration assertions**

Test for all table names, `UNIQUE (user_id, stock_id)`, `UNIQUE (user_id, client_request_id)`, the partial active-run index, four ownership policies per Agent table, both publication additions, and both `ON DELETE SET NULL` report foreign keys.

- [ ] **Step 2: Run RED**

Run `pnpm exec tsx --test --tsconfig=server/tsconfig.json server/src/agent/agent-migration.test.ts`.
Expected: FAIL because `0009_agent_core.sql` is absent.

- [ ] **Step 3: Create the migration**

Create the tables with these exact columns and constraints, then add the indexes below:

```sql
CREATE TABLE agent_threads (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stock_id VARCHAR(36) NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, stock_id)
);
CREATE TABLE agent_messages (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id VARCHAR(36) NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user','assistant','tool')),
  content TEXT NOT NULL,
  provider VARCHAR(20), model VARCHAR(100), run_id VARCHAR(36),
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE agent_runs (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id VARCHAR(36) NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_message_id VARCHAR(36) NOT NULL REFERENCES agent_messages(id) ON DELETE CASCADE,
  client_request_id VARCHAR(100) NOT NULL,
  provider VARCHAR(20) NOT NULL, model VARCHAR(100) NOT NULL,
  credential_mode VARCHAR(20), status VARCHAR(20) NOT NULL DEFAULT 'queued',
  stage VARCHAR(30) NOT NULL DEFAULT 'queued', attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 2, locked_at TIMESTAMPTZ, locked_by VARCHAR(100),
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  error_code VARCHAR(100), error_message TEXT, retry_after INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE agent_messages ADD CONSTRAINT agent_messages_run_fk
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE;
CREATE TABLE agent_tool_calls (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id VARCHAR(36) NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  thread_id VARCHAR(36) NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_name VARCHAR(100) NOT NULL, arguments JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB, status VARCHAR(20) NOT NULL, error_code VARCHAR(100), duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ
);
ALTER TABLE ai_reports ADD COLUMN agent_run_id VARCHAR(36)
  REFERENCES agent_runs(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX agent_threads_user_stock_uq ON agent_threads(user_id, stock_id);
CREATE UNIQUE INDEX agent_runs_user_request_uq ON agent_runs(user_id, client_request_id);
CREATE UNIQUE INDEX agent_runs_one_active_per_thread_uq
  ON agent_runs(thread_id) WHERE status IN ('queued', 'running');
CREATE UNIQUE INDEX ai_reports_agent_run_uq
  ON ai_reports(agent_run_id) WHERE agent_run_id IS NOT NULL;
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_attempts_ck
  CHECK (attempt_count >= 0 AND max_attempts = 2);
ALTER PUBLICATION supabase_realtime ADD TABLE agent_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_messages;
```

For every table create SELECT/INSERT/UPDATE/DELETE policies `TO authenticated` with `(select auth.uid()) = user_id`; UPDATE includes both `USING` and `WITH CHECK`. Add `GRANT SELECT ON agent_runs, agent_messages TO authenticated`; writes continue through NestJS.

- [ ] **Step 4: Mirror the schema in Drizzle**

Add `agentThreads`, `agentMessages`, `agentRuns`, and `agentToolCalls`, including enum-like varchar comments, JSON defaults, foreign-key delete rules and indexes. Add nullable `agent_run_id` to `aiReports` and export inferred types.

- [ ] **Step 5: Verify and commit**

Run migration test and `pnpm build:server`; expect PASS. Apply through the project's configured database workflow, then query `pg_policies`, `pg_publication_tables`, and `information_schema.table_constraints`. Commit with `git commit -m "feat: 新增 Agent 核心数据模型"`.

### Task 3: Implement ownership-safe persistence

**Files:** Create `server/src/agent/agent.repository.ts`, `server/src/agent/agent.repository.test.ts`

- [ ] **Step 1: Write PostgreSQL behavior tests**

Create isolated test tables and fixtures for users `u1/u2`. Cover: concurrent `getOrCreateThread` yields one row, cross-user lookup returns null, messages order by `created_at,id`, cursor pagination has no duplicates, active-run uniqueness rejects the second run, duplicate `clientRequestId` returns the original run, and stock deletion preserves report snapshot while nulling both foreign keys.

- [ ] **Step 2: Run RED**

Run `pnpm exec tsx --test --tsconfig=server/tsconfig.json server/src/agent/agent.repository.test.ts`.
Expected: FAIL because `AgentRepository` is undefined.

- [ ] **Step 3: Implement the repository API**

```ts
export interface AgentRepositoryContract {
  getOrCreateThread(userId: string, stockId: string): Promise<AgentThread>
  findThread(userId: string, threadId: string): Promise<AgentThread | null>
  findThreadByStock(userId: string, stockId: string): Promise<AgentThread | null>
  listMessages(userId: string, threadId: string, cursor: string | null, limit: number): Promise<MessagePage<AgentMessage>>
  findRun(userId: string, runId: string): Promise<AgentRun | null>
  listReports(userId: string, stockId: string): Promise<AgentReportSummary[]>
}
```

Use parameterized `pg` queries. `getOrCreateThread` uses `INSERT INTO agent_threads (user_id, stock_id, title) SELECT $1, id, name FROM stocks WHERE id = $2 AND user_id = $1 ON CONFLICT (user_id, stock_id) DO UPDATE SET updated_at = agent_threads.updated_at RETURNING id, user_id, stock_id, title, created_at, updated_at`. Every read includes `user_id`; message reads join the owned thread. Cursor is base64url JSON `{createdAt,id}` and query condition is `(created_at,id) < ($cursorAt,$cursorId)`.

- [ ] **Step 4: Run GREEN and commit**

Run repository tests twice to catch isolation leaks, then `pnpm build:server`; expect PASS. Commit with `git commit -m "feat: 实现 Agent 持久化边界"`.

### Task 4: Expose batch-1 APIs

**Files:** Create `server/src/agent/agent.dto.ts`, `agent.service.ts`, `agent.controller.ts`, `agent.module.ts`, `agent-api.test.ts`; modify `server/src/app.module.ts`

- [ ] **Step 1: Write failing API tests**

Cover `stock_id` required and trimmed, message limit clamped to 1–50, POST returns HTTP 200, non-owned resources become 404, and envelopes have exactly one top-level `data` property. Assert no `POST /threads/:id/messages` route exists in this batch.

- [ ] **Step 2: Run RED**

Run `pnpm exec tsx --test --tsconfig=server/tsconfig.json server/src/agent/agent-api.test.ts`.
Expected: FAIL because controller and service are absent.

- [ ] **Step 3: Implement DTOs and controller**

Register exactly: `GET agent/threads`, `POST agent/threads`, `GET agent/threads/:id/messages`, `GET agent/runs/:id`, and `GET agent/reports`. Decorate POST with `@HttpCode(200)`. The service converts null repository results to `NotFoundException('资源不存在')`.

- [ ] **Step 4: Wire module and add test command**

Import `AgentModule` after `AiModule`. Add `test:agent:batch1` running the three focused test files with the server tsconfig.

- [ ] **Step 5: Verify and commit**

Run `pnpm test:agent:batch1`, `pnpm validate`, and `pnpm build:server`; expect PASS. Commit with `git commit -m "feat: 新增 Agent 基础查询接口"`.

### Task 5: Run the batch gate

- [ ] Verify `pnpm test:agent:batch1`, `pnpm validate`, and `pnpm build:server` all exit 0.
- [ ] Query RLS policies as authenticated users `u1/u2`; each user sees only owned Agent rows.
- [ ] Confirm `agent_runs` and `agent_messages` appear in `pg_publication_tables` for `supabase_realtime`.
- [ ] Record executed commands and commit hash in the PR description; do not begin batch 2 while any gate is red.
