# Docker Batch 1 Runtime Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this batch task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish container-safe environment loading, production configuration validation, a stable public health endpoint, and build-time public-variable validation without requiring Docker to be installed.

**Architecture:** NestJS loads injected variables first and uses `.env.local` only as a non-overriding local fallback. Small unit-tested validators own server runtime requirements and public H5/mini-program build requirements; application and Docker code consume those validators instead of duplicating rules.

**Tech Stack:** NestJS 10, dotenv, Node test runner through `tsx`, Taro config, pnpm.

---

## Dependencies and Ownership

- Base commit must contain:
  - `e5d1843` Docker design spec.
  - `2dbf125` canonical Docker implementation plan.
- This is the first implementation batch and has no Docker CLI dependency.
- Work on one integration branch, recommended: `codex/docker-runtime`.
- Preserve unrelated workspace changes. Prefer an isolated worktree.
- Canonical detailed steps: Tasks 1–2 in
  `docs/superpowers/plans/2026-06-21-docker-development-production.md`.

## Files

**Create**

- `server/src/bootstrap/runtime-environment.ts`
- `server/src/bootstrap/runtime-environment.test.ts`
- `server/src/app.controller.test.ts`
- `scripts/validate-docker-env.mjs`
- `scripts/validate-docker-env.test.ts`

**Modify**

- `server/src/main.ts`
- `server/src/app.controller.ts`
- `server/src/agent/agent-api.test.ts`
- `config/index.ts`
- `package.json`

## Task 1: Runtime environment and health

- [ ] Write the runtime environment tests from canonical Task 1, Steps 1–2.
- [ ] Run the focused tests and confirm RED.
- [ ] Implement `loadRuntimeEnvironment()` with `override: false`.
- [ ] Implement `validateProductionServerEnvironment()`.
- [ ] Make NestJS listen on `0.0.0.0`.
- [ ] Change `/api/health` to return only `status` and ISO `timestamp`.
- [ ] Remove the obsolete source-text dotenv assertion from `agent-api.test.ts`.
- [ ] Run:

```bash
pnpm exec tsx --test --tsconfig=server/tsconfig.json \
  server/src/bootstrap/runtime-environment.test.ts \
  server/src/app.controller.test.ts \
  server/src/agent/agent-api.test.ts
pnpm build:server
```

Expected: all tests pass and the server build exits `0`.

- [ ] Commit:

```bash
git add \
  server/src/bootstrap/runtime-environment.ts \
  server/src/bootstrap/runtime-environment.test.ts \
  server/src/app.controller.test.ts \
  server/src/main.ts \
  server/src/app.controller.ts \
  server/src/agent/agent-api.test.ts
git commit -m "feat: 增加容器运行环境与健康检查"
```

## Task 2: Public build validation and proxy target

- [ ] Write `scripts/validate-docker-env.test.ts` exactly as canonical Task 2 specifies.
- [ ] Run it and confirm RED.
- [ ] Implement `scripts/validate-docker-env.mjs`.
- [ ] Make only the H5 development proxy target configurable:

```ts
target: process.env.H5_PROXY_TARGET || 'http://localhost:3000'
```

- [ ] Merge the following script into the existing `package.json` without removing user scripts:

```json
"test:docker": "tsx --test scripts/validate-docker-env.test.ts docker/docker-contract.test.ts"
```

The full script will become runnable after Batch 2 creates `docker/docker-contract.test.ts`.

- [ ] Run:

```bash
pnpm exec tsx --test scripts/validate-docker-env.test.ts
pnpm validate
```

Expected: tests and validation pass.

- [ ] Commit:

```bash
git add scripts/validate-docker-env.mjs scripts/validate-docker-env.test.ts config/index.ts package.json
git commit -m "feat: 增加 Docker 构建环境校验"
```

## Batch Gate

- [ ] Production validation reports missing variable names but never values.
- [ ] Injected environment variables are not overwritten by `.env.local`.
- [ ] Development remains usable without production-only variables.
- [ ] `/api/health` is public and contains no configuration details.
- [ ] H5 proxy still defaults to `http://localhost:3000` outside Docker.
- [ ] `pnpm validate` and `pnpm build:server` pass.
- [ ] `git diff --check` passes.

## Handoff

Record both commit hashes and verification output in
`docs/superpowers/HANDOFF-dockerization-2026-06-21.md`, then hand the same integration branch to Batch 2.
