# Stock Agent Batch 4 Background Runs and Realtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept idempotent message submissions, execute Agent runs in a recoverable PostgreSQL worker, and expose secure realtime progress and messages.

**Architecture:** Submission is one short database transaction. Workers claim durable rows with `FOR UPDATE SKIP LOCKED`, execute the batch-3 orchestrator outside transactions, heartbeat leases, and finalize messages plus run state atomically. Supabase Realtime is an observation channel; REST remains the source of recovery truth.

**Tech Stack:** NestJS Schedule, PostgreSQL/pg, Supabase Realtime, Node test runner, pnpm.

---

## File Map

**Create**

- `server/src/agent/runs/run-submission.ts`: idempotent submission transaction.
- `server/src/agent/runs/run-queue.repository.ts`: claim, heartbeat, retry, recovery and finalization SQL.
- `server/src/agent/runs/agent-worker.service.ts`: bounded concurrent polling/execution.
- `server/src/agent/runs/run-recovery.service.ts`: expired lease scan.
- `server/src/agent/runs/run-submission.test.ts`, `run-queue.test.ts`, `agent-worker.test.ts`, `agent-realtime-rls.test.ts`.

**Modify**

- `server/src/agent/agent.dto.ts`, `agent.service.ts`, `agent.controller.ts`, `agent.module.ts`: message endpoint and worker wiring.
- `server/src/agent/agent.repository.ts`: finalization and retry history methods.
- `.env.example`: worker concurrency, poll interval and lease variables.
- `package.json`: add batch-4 test command.

### Task 1: Implement the idempotent submission transaction

**Files:** Create `run-submission.ts`, `run-submission.test.ts`; modify DTO.

- [ ] Write RED PostgreSQL tests for a valid submission, duplicate `clientRequestId`, simultaneous duplicate requests, existing active run, foreign thread, disabled model, and whitespace/length validation.
- [ ] Define DTO fields `content` (1–12000 trimmed characters), `provider`, `model`, and `clientRequestId` (UUID or 16–100 safe characters).
- [ ] Implement one `BEGIN`/`COMMIT` transaction: lock owned thread; look up an existing idempotent Run first; reject another active Run with `ConflictException` carrying its safe summary; insert user message; insert queued Run; commit. On unique-race failure, rollback and re-read by `(user_id, client_request_id)`.
- [ ] Return `{ message, run }`, never return 201. Run tests; expect PASS. Commit `feat: 实现 Agent 消息幂等提交`.

### Task 2: Claim and heartbeat durable runs

**Files:** Create `run-queue.repository.ts`, `run-queue.test.ts`

- [ ] Write RED tests with two database clients claiming ten runs concurrently. Assert no duplicate IDs, FIFO by `created_at`, locks released before execution, heartbeat only updates matching `locked_by`, and concurrency never exceeds requested claims.
- [ ] Implement claim SQL as one transaction using:

```sql
SELECT id FROM agent_runs
WHERE status = 'queued'
ORDER BY created_at, id
FOR UPDATE SKIP LOCKED
LIMIT $1;
```

Update selected rows to `running/loading_context`, set worker identity/timestamps, increment attempt count, return rows, then commit.
- [ ] Implement `heartbeat(runId, workerId)`, `markRetryable`, `markFailed`, and lease comparisons using database `now()` rather than process time.
- [ ] Run tests; expect PASS. Commit `feat: 实现 Agent Run 持久队列`.

### Task 3: Finalize success atomically

**Files:** Extend queue repository and tests.

- [ ] Write RED fault-injection tests proving assistant-message insert failure leaves Run running/recoverable, and successful finalization creates exactly one assistant message and completed Run.
- [ ] Implement one transaction that verifies `status='running' AND locked_by=$worker`, inserts the assistant message with verified citations/provider metadata, closes open tool calls, and updates Run to `completed/completed` with timestamps and cleared lock.
- [ ] Add unique protection for one assistant message per Run in migration if batch-1 schema lacks it: create `0010_agent_run_finalization.sql` with a partial unique index on `agent_messages(run_id)` where `role='assistant'`.
- [ ] Run tests; expect PASS. Commit `feat: 原子完成 Agent Run`.

### Task 4: Implement worker retry and recovery

**Files:** Create `agent-worker.service.ts`, `run-recovery.service.ts`, `agent-worker.test.ts`

- [ ] Write RED fake-timer tests for default concurrency 2, stage callbacks, graceful stop abort, one temporary retry, no auth/quota/429/parameter retry, expired lease requeue, and exhausted attempt failure.
- [ ] Implement a scheduled poll with an in-memory semaphore; claim only available slots. Execute orchestrator outside a transaction. Heartbeat every 15 seconds; default lease is 45 seconds.
- [ ] On retryable failure and `attemptCount < maxAttempts`, return the same Run to `queued/queued` and clear lock; otherwise persist standardized safe error and `failed/failed`. Preserve `retryAfter` for 429 even though it is not automatically retried.
- [ ] Recovery runs at startup and every 30 seconds. Expired rows with attempts remaining requeue; exhausted rows fail with `AGENT_WORKER_LOST`.
- [ ] Run tests; expect PASS. Commit `feat: 新增 Agent 后台 Worker`.

### Task 5: Register message and retry APIs

**Files:** Modify controller/service/module; extend API tests.

- [ ] Write RED tests for `POST /api/agent/threads/:id/messages` HTTP 200, active-run 409, duplicate request replay, safe errors and ownership 404.
- [ ] Add the endpoint using `RunSubmission`. Add `POST /api/agent/runs/:id/retry` that reads the original user message, requires failed status, accepts a new `clientRequestId`, and creates a new user message/Run with `metadata.retryOfRunId`; default provider/model are original unless explicitly supplied from allowed catalog.
- [ ] Register Worker and Recovery providers. Add env defaults `AGENT_WORKER_CONCURRENCY=2`, `AGENT_WORKER_POLL_MS=1000`, `AGENT_RUN_LEASE_MS=45000` and validate upper bounds.
- [ ] Run API tests; expect PASS. Commit `feat: 开放 Agent 异步消息接口`.

### Task 6: Verify Realtime ownership and REST recovery

**Files:** Create `agent-realtime-rls.test.ts`; modify package script.

- [ ] Using two authenticated test JWTs, subscribe to owned run/message filters, insert through the server, and assert only the owner receives events. Also assert REST `GET run` and message pagination reconstruct the terminal state after discarding events.
- [ ] Verify logout JWT reset and channel removal using existing `src/lib/realtime-auth.test.ts` plus the new integration test.
- [ ] Add `test:agent:batch4`; run it with batches 1–3, `pnpm validate`, and `pnpm build:server`. Expect PASS. Commit `test: 验证 Agent Realtime 数据隔离`.

### Task 7: Run the batch gate

- [ ] Submit through HTTP and observe `queued → loading_context → generating/tool stage → completed` plus assistant message.
- [ ] Kill a worker mid-run; after lease expiry the Run retries once or fails at max attempts without a duplicate assistant message.
- [ ] Run two workers against the same queue; each Run finalizes once.
- [ ] Verify 401, quota and 429 fail without automatic provider switching.
- [ ] All batch tests, validation and server build must exit 0 before batch 5.
