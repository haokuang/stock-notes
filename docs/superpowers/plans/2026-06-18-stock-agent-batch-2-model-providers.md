# Stock Agent Batch 2 Model Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide contract-tested DeepSeek, OpenAI, and MiniMax adapters plus safe model availability and MiniMax Coding Plan health reporting.

**Architecture:** Provider adapters translate between the batch-1 neutral domain and OpenAI-compatible wire formats. A registry selects one explicit provider only; configuration, health state, and error normalization are separate services so SDK details and credentials cannot leak into Agent business code or API responses.

**Tech Stack:** NestJS, OpenAI Node SDK, native `fetch` for health probes where needed, Zod, Node test runner, pnpm.

---

## File Map

**Create**

- `server/src/agent/providers/provider.types.ts`: neutral request/result/tool contracts.
- `server/src/agent/providers/provider-error.ts`: standard error codes and mapping helpers.
- `server/src/agent/providers/provider-config.ts`: environment parsing and allowed model catalog.
- `server/src/agent/providers/openai-compatible.ts`: shared request/response translation.
- `server/src/agent/providers/deepseek.provider.ts`, `openai.provider.ts`, `minimax.provider.ts`: adapters.
- `server/src/agent/providers/provider-registry.ts`: explicit lookup, never fallback.
- `server/src/agent/providers/provider-health.service.ts`: non-blocking health state.
- `server/src/agent/providers/provider-contract.test.ts`, `provider-config.test.ts`, `provider-health.test.ts`: tests.

**Modify**

- `server/src/agent/agent.types.ts`: add `AgentModelOption` and provider metadata/result types.
- `server/src/agent/agent.service.ts`, `agent.controller.ts`, `agent.module.ts`: models endpoint and DI.
- `.env.example`: document all provider variables without real secrets.
- `package.json`: add batch-2 test command.

### Task 1: Define the neutral Provider protocol

**Files:** Create `provider.types.ts`, `provider-contract.test.ts`

- [ ] Write a failing compile/runtime contract test for:

```ts
export type AgentStandardMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; toolCallId?: string; toolCalls?: AgentToolCall[] }
export type AgentToolDefinition = { name: string; description: string; inputSchema: Record<string, unknown> }
export type AgentToolCall = { id: string; name: string; arguments: Record<string, unknown> }
export type AgentProviderRequest = { model: string; messages: AgentStandardMessage[]; tools: AgentToolDefinition[]; signal: AbortSignal; traceId: string }
export type AgentTurnResult = { content: string; toolCalls: AgentToolCall[]; citations: AgentCitation[]; providerMetadata: Record<string, unknown> }
export interface AgentModelProvider { readonly provider: AgentProvider; generate(request: AgentProviderRequest): Promise<AgentTurnResult>; checkHealth(): Promise<ProviderHealth> }
```

- [ ] Run `pnpm exec tsx --test --tsconfig=server/tsconfig.json server/src/agent/providers/provider-contract.test.ts`; expect module-not-found failure.
- [ ] Implement the contracts, including `ProviderHealth` with `checking|available|unavailable|rate_limited`, safe reason, retryAfter and checkedAt.
- [ ] Re-run; expect PASS. Commit `feat: 定义 Agent Provider 协议`.

### Task 2: Parse configuration and build the model catalog

**Files:** Create `provider-config.ts`, `provider-config.test.ts`; modify `.env.example`

- [ ] Write table-driven RED tests for all development/production × api/coding_plan combinations, missing selected credentials, invalid credential mode, and unselected MiniMax secret exclusion.
- [ ] Implement `loadProviderConfig(env)` with Zod. It returns disabled entries rather than throwing for a missing optional provider; malformed configured values throw at startup with variable names but never values.
- [ ] Implement `buildModelCatalog(config, health)` returning only configured model IDs and labels. MiniMax labels include `Coding Plan` or `正式 API`; output has no `apiKey` or `baseUrl` keys.
- [ ] Add blank `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `AGENT_DEEPSEEK_MODEL`, `OPENAI_API_KEY`, `AGENT_OPENAI_MODEL`, `MINIMAX_CREDENTIAL_MODE`, `MINIMAX_API_KEY`, `MINIMAX_BASE_URL`, `MINIMAX_CODING_PLAN_API_KEY`, `MINIMAX_CODING_PLAN_BASE_URL`, and `AGENT_MINIMAX_MODEL` entries to `.env.example`.
- [ ] Run the config tests and `pnpm build:server`; expect PASS. Commit `feat: 配置 Agent 模型目录`.

### Task 3: Normalize Provider errors

**Files:** Create `provider-error.ts`, `provider-error.test.ts`

- [ ] Write RED tests mapping 401, 403, 429 with `retry-after`, quota text, 400, AbortError, network errors and 5xx to the seven approved codes.
- [ ] Implement `ProviderError extends Error` with `code`, `retryable`, `safeMessage`, `retryAfter`, `provider`, and `cause`; never copy response body into `safeMessage`.
- [ ] Implement `normalizeProviderError(provider, error)` so only timeout, network and 5xx are retryable; 429 remains non-automatic-retry but retains retryAfter.
- [ ] Run tests; expect PASS. Commit `feat: 统一模型调用错误`.

### Task 4: Implement three adapters under one contract

**Files:** Create `openai-compatible.ts`, three provider files; extend `provider-contract.test.ts`

- [ ] Add RED fixtures for text-only output, multiple tool calls, malformed JSON arguments, response ID metadata, request cancellation, and each normalized error for all three providers.
- [ ] Implement a shared translator producing OpenAI chat-completions messages/tools. DeepSeek and MiniMax receive configured `baseURL`; OpenAI uses its standard endpoint. Instantiate SDK clients inside provider factories from validated config.
- [ ] Map tool arguments with `JSON.parse`; malformed arguments throw `PROVIDER_INVALID_REQUEST`. Return `citations: []`; citations are created by tools in batch 3. Keep only request/response IDs and token counts in `providerMetadata`.
- [ ] Prove no-fallback behavior with a registry test: one failing provider causes one adapter invocation and propagates the same standardized error.
- [ ] Run provider contract tests; expect PASS. Commit `feat: 接入三种 Agent 模型 Provider`.

### Task 5: Add non-blocking health and models API

**Files:** Create `provider-health.service.ts`, `provider-health.test.ts`; modify `agent.service.ts`, `agent.controller.ts`, `agent.module.ts`

- [ ] Write RED fake-timer tests: startup returns immediately with MiniMax `checking`; success becomes available; 401 unavailable; 429 rate_limited; later success clears errors.
- [ ] Implement `OnModuleInit` that schedules `void refresh('minimax')` without awaiting it. Store health in memory by provider and expose `getHealth`/`refresh`; log provider, safe code and upstream request ID only.
- [ ] Add `GET /api/agent/models` returning `{ data: AgentModelOption[] }`. Never serialize config objects.
- [ ] Run `pnpm test:agent:batch2`, `pnpm validate`, and `pnpm build:server`; expect PASS. Commit `feat: 暴露 Agent 模型可用状态`.

### Task 6: Run the batch gate

- [ ] Start with MiniMax credentials absent: service starts and models endpoint marks MiniMax unavailable.
- [ ] Start with `NODE_ENV=production` and `MINIMAX_CREDENTIAL_MODE=coding_plan`: health probe runs against Coding Plan base URL.
- [ ] Simulate 429 and quota exhaustion: current call fails visibly and no other adapter is invoked.
- [ ] Confirm logs and `/api/agent/models` contain no key/base URL.
- [ ] Run all batch-1 and batch-2 tests, `pnpm validate`, and `pnpm build:server`; all must exit 0 before batch 3.
