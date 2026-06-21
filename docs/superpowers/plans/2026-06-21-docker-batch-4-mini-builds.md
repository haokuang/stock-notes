# Docker Batch 4 Mini-Program Builds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this batch task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-command Docker builds for WeChat and Douyin mini-programs, with separate host outputs and a complete non-secret production environment template.

**Architecture:** One-shot Compose services reuse the `mini-build` image target, validate a real HTTPS `PROJECT_DOMAIN`, write directly to platform-specific host output directories, and exit with the underlying build status.

**Tech Stack:** Docker Compose v2, Taro WeChat/Douyin builds, pnpm.

---

## Dependencies and Ownership

- Start from completed Batches 1–3.
- `.env.production` must contain a real platform-registered HTTPS API domain.
- Canonical detailed steps: Task 6 in
  `docs/superpowers/plans/2026-06-21-docker-development-production.md`.

## Files

**Create**

- `docker-compose.tools.yml`
- `.env.production.example`

**Modify**

- `.gitignore`
- `.env.example`
- `docker/docker-contract.test.ts`
- `package.json`

## Task 1: Tool Compose and templates

- [ ] Add mini-build and environment-template contract tests from canonical Task 6.
- [ ] Run them and confirm RED.
- [ ] Create `docker-compose.tools.yml` with:
  - `weapp-build` → `/output` mounted from `./dist`;
  - `tt-build` → `/output` mounted from `./dist-tt`;
  - `OUTPUT_ROOT=/output`;
  - production environment injection;
  - `node scripts/validate-docker-env.mjs mini` before each build.
- [ ] Create the complete `.env.production.example` listed in canonical Task 6.
- [ ] Keep every secret value blank.
- [ ] Keep `PROJECT_DOMAIN` blank so users must provide the real HTTPS domain.
- [ ] Add `SUPABASE_DB_PASSWORD` and `DB_CONNECTION_PROFILE` to `.env.example`.
- [ ] Remove duplicate DeepSeek entries while preserving one canonical copy.
- [ ] Ignore `.env.production` while retaining `.env.production.example`.

## Task 2: One-command builds

- [ ] Add:

```json
"docker:build:weapp": "docker compose --env-file .env.production -f docker-compose.tools.yml run --rm weapp-build",
"docker:build:tt": "docker compose --env-file .env.production -f docker-compose.tools.yml run --rm tt-build"
```

- [ ] Run:

```bash
docker compose --env-file .env.production -f docker-compose.tools.yml config
pnpm test:docker
pnpm docker:build:weapp
test -f dist/app.json
pnpm docker:build:tt
test -f dist-tt/app.json
```

- [ ] Verify invalid domains fail:

```bash
docker compose --env-file .env.production -f docker-compose.tools.yml \
  run --rm -e PROJECT_DOMAIN=http://localhost:3000 weapp-build
```

Expected: non-zero exit mentioning HTTPS.

- [ ] Commit:

```bash
git add \
  docker-compose.tools.yml \
  .env.production.example \
  .env.example \
  .gitignore \
  docker/docker-contract.test.ts \
  package.json
git commit -m "feat: 增加小程序 Docker 一键构建"
```

## Batch Gate

- [ ] Tool Compose parses.
- [ ] WeChat build writes usable output only to `dist/`.
- [ ] Douyin build writes usable output only to `dist-tt/`.
- [ ] Missing or non-HTTPS `PROJECT_DOMAIN` fails before Taro build.
- [ ] No automatic upload or publish occurs.
- [ ] Templates contain variable names but no real credentials.
- [ ] Real `.env.production` remains untracked.

## Handoff

Record both output paths, build durations, command exit codes, invalid-domain evidence, commit hash, and any platform-specific warnings in the shared handoff file.
