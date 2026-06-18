# Stock Agent Batch 5 Product Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete H5 and WeChat Stock Agent experience, report persistence, legacy compatibility, and production release evidence.

**Architecture:** Framework-independent state helpers normalize API envelopes, merge REST and Realtime data by ID, map stages/errors, and control fallback polling. Taro pages compose existing UI components around those helpers; the server saves reports idempotently from completed assistant messages and continues serving the legacy endpoint for one cycle.

**Tech Stack:** Taro 4, React 18, TypeScript, Supabase Realtime, NestJS, project `@/components/ui`, lucide-react-taro, Tailwind, pnpm.

---

## File Map

**Create**

- `src/agent/agent-api.ts`: typed `Network` calls and explicit envelope unwrap.
- `src/agent/agent-state.ts`: message upsert, active Run, stage/error labels and polling decisions.
- `src/hooks/use-agent-realtime.ts`: authenticated run/message subscription with cleanup.
- `src/hooks/use-agent-conversation.ts`: initial REST load, Realtime merge and bounded polling fallback.
- `src/pages/agent-chat/index.tsx`, `index.config.ts`: conversation page.
- `src/agent/agent-api.test.ts`, `agent-state.test.ts`, `agent-conversation.test.ts`: pure tests.
- `server/src/agent/report.service.ts`, `report-persistence.test.ts`: idempotent report save.

**Modify**

- `src/pages/analysis/index.tsx`: Agent stock/thread home while retaining image analysis.
- `src/pages/ai-report/index.tsx`: `report_id` primary load with legacy fallbacks.
- `src/pages/stock/index.tsx`: Agent report entry/list.
- `src/app.config.ts`: register chat page.
- `server/src/agent/agent.controller.ts`, `agent.service.ts`, `agent.module.ts`: save-report and report-detail endpoints.
- `server/src/ai/ai.module.ts`: one-cycle legacy response header/message only; no new-agent double write.
- `package.json`: batch-5 and all-Agent test commands.

### Task 1: Build typed API and state helpers

**Files:** Create `agent-api.ts`, `agent-state.ts` and tests.

- [ ] Write RED tests for double-data unwrap, malformed envelope rejection, message ID upsert, stable chronological sort, active Run selection, all seven stages, all standardized errors, retryAfter formatting and polling stop at terminal state.
- [ ] Implement `unwrapApiResponse<T>(response)` reading `response.data?.data`; log `console.log('[agent-api] response body', response.data)` only in development before unwrap. Throw `AgentApiError` on missing business data.
- [ ] Implement only `Network.request` calls with these relative URLs: `/api/agent/models`, `/api/agent/threads`, `/api/agent/threads/:id/messages`, `/api/agent/runs/:id`, `/api/agent/runs/:id/retry`, `/api/agent/reports`, `/api/agent/reports/:id`, and `/api/agent/runs/:id/save-report`.
- [ ] Export pure `upsertMessages`, `mergeRun`, `stageLabel`, `errorPresentation`, `shouldPoll`. Run tests; expect PASS. Commit `feat: 新增 Agent 前端数据层`.

### Task 2: Implement Realtime with polling compensation

**Files:** Create two hooks and `agent-conversation.test.ts`

- [ ] Write RED tests with fake channels/timers: subscribe to target Thread/Run, ignore wrong IDs, cleanup on unmount/logout, dedupe REST plus event, poll after channel error, exponential intervals capped at 5 seconds, and stop on completed/failed.
- [ ] Implement `useAgentRealtime` using existing `getSupabase()` and two `postgres_changes` handlers. Validate `thread_id`/`run_id` inside callbacks even after database filters.
- [ ] Implement `useAgentConversation` to load message pages and current Run, merge by ID, and start REST polling only after `CHANNEL_ERROR`, `TIMED_OUT`, or reconnect recovery. Poll 1s, 2s, 3s, then 5s until terminal.
- [ ] Run tests; expect PASS. Commit `feat: 接入 Agent 实时会话状态`.

### Task 3: Replace the analysis home

**Files:** Modify `src/pages/analysis/index.tsx`; extend frontend tests.

- [ ] Write RED navigation/helper tests: stock click creates or reuses Thread then navigates with `thread_id` and `stock_id`; loading prevents duplicate tap; image-analysis route remains.
- [ ] Refactor the page to fetch stocks plus Thread summaries. Use `Card`, `CardContent`, `Button`, `Badge`, and `Skeleton` from `@/components/ui`; retain Taro `View/Text` only for page layout/content and add `block` to vertical Text.
- [ ] Remove the `/api/ai/analyze-stock` call and URL-embedded report. Use lucide props for size/color and Tailwind preset classes; do not add local images or arbitrary pixel classes.
- [ ] Run tests and `pnpm validate`; expect PASS. Commit `feat: 将 AI 分析页升级为 Agent 首页`.

### Task 4: Build the stock conversation page

**Files:** Create page files; modify `src/app.config.ts`

- [ ] Write RED view-model tests for per-message provider/model, unavailable MiniMax reason, Coding Plan label, sending disabled during active Run, preserved failed user message, original-model retry, citations and search-unavailable notice.
- [ ] Register `pages/agent-chat/index`. Build header stock identity, scrollable messages, stage row, error card, citation cards, model `Select`, UI `Textarea`, and UI `Button`.
- [ ] Use fixed input-bar inline style only for required cross-end `position/display/flex/bottom/zIndex`; use Tailwind for all other visual properties. Avoid direct native `Input`, `Taro.request`, hard-coded domains and placeholder resources.
- [ ] On send, generate `clientRequestId`, optimistically merge the server-returned user message and Run, then let Realtime/REST add assistant output. Retry calls the retry endpoint with a new key and original provider/model.
- [ ] For external citation URLs, use supported H5 navigation and a WeChat copy-link fallback; do not embed a WebView without configured domains.
- [ ] Run tests, `pnpm validate`, `pnpm build:web`, and `pnpm build:weapp`; expect PASS. Commit `feat: 新增股票 Agent 对话页`.

### Task 5: Save and load formal reports

**Files:** Create server report files/test; modify controller/service/module and report page.

- [ ] Write RED PostgreSQL tests: only completed owned Run saves, final assistant message is required, two simultaneous saves return one report, failed/foreign Run is 404, and saved content/citations/provider/model are immutable snapshots.
- [ ] Implement a transaction inserting `ai_reports` with `type='agent_report'`, unique `agent_run_id`, title `${stockName} · Agent 投研报告`, final content and safe metadata. On conflict return the existing report. POST returns HTTP 200.
- [ ] Add `GET /api/agent/reports/:id` and `POST /api/agent/runs/:id/save-report`.
- [ ] Update report page load precedence: `report_id`, then legacy `report`, `brief`, finally `stock_id`. Agent report renders server-verified citations and never calls daily-brief when `report_id` is present.
- [ ] Run tests; expect PASS. Commit `feat: 支持保存 Agent 正式报告`.

### Task 6: Link reports from stock detail and preserve compatibility

**Files:** Modify stock page and legacy AI controller/tests.

- [ ] Write RED tests for current-stock report filtering, latest-first order, report navigation by ID, and legacy analyze endpoint remaining callable without creating Agent rows.
- [ ] Add an Agent report section to stock detail using existing `Card`, `Badge`, `Button`, and Skeleton components. Empty state links to the Agent tab/conversation.
- [ ] Keep `/api/ai/analyze-stock` for one release cycle and add a deprecation response field/message; do not call `AgentOrchestrator`, create Thread/Run, or double-write reports.
- [ ] Run focused tests; expect PASS. Commit `feat: 接通股票 Agent 报告入口`.

### Task 7: Production and cross-platform gate

- [ ] Run `pnpm test:agent:all`, `pnpm validate`, `pnpm build:server`, `pnpm build:web`, and `pnpm build:weapp`; all exit 0.
- [ ] H5: create/reuse Thread, switch DeepSeek→OpenAI→MiniMax across turns, refresh mid-Run, simulate Realtime disconnect, retry failure, open citations, save and reopen report.
- [ ] WeChat: verify message scroll, textarea/keyboard, fixed composer safe area, model select, progress, retry, copied external link, save and report navigation.
- [ ] Security: two accounts cannot see each other's events/reports; logs contain no keys, full prompts or raw search bodies.
- [ ] MiniMax: account holder records Coding Plan production-use confirmation in release checklist; without confirmation keep MiniMax unavailable while other providers work.
- [ ] Add test evidence and known compatibility removal date for `/api/ai/analyze-stock` to release notes. Commit `docs: 记录 Agent 上线验收结果`.
