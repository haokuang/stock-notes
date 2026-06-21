# Docker Batch 5 Documentation and Release Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and superpowers:verification-before-completion. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish operator documentation, run the complete Docker and non-Docker regression matrix, correct only Docker-scope defects, and prepare a precise handoff for final review by the original Codex agent.

**Architecture:** No new runtime capability is planned in this batch. Documentation codifies the implemented interfaces, while a clean-build verification matrix proves development, production, mini-program, security, and legacy pnpm workflows together.

**Tech Stack:** Markdown, Docker Compose v2, curl, pnpm tests/builds.

---

## Dependencies and Ownership

- Start only after Batches 1–4 pass their gates.
- Canonical detailed steps: Tasks 7–8 in
  `docs/superpowers/plans/2026-06-21-docker-development-production.md`.
- Do not broaden scope or refactor unrelated application code.
- Any verification correction must touch only files introduced or intentionally modified by Batches 1–4.

## Files

**Create**

- `docs/DOCKER.md`

**Modify**

- `README.md`
- `docker/docker-contract.test.ts`
- `docs/superpowers/HANDOFF-dockerization-2026-06-21.md`

## Task 1: Operations documentation

- [ ] Add the documentation contract test from canonical Task 7.
- [ ] Run it and confirm RED.
- [ ] Create `docs/DOCKER.md` using the complete guide in canonical Task 7.
- [ ] Cover:
  - Docker/Compose requirements;
  - `.env.local` development;
  - `.env.production` preparation;
  - production build/start/stop;
  - single-origin `/api`;
  - external HTTPS gateway;
  - WeChat and Douyin builds;
  - logs and health;
  - no-cache rebuild;
  - dependency-volume reset;
  - port conflicts, polling, 502, missing variables, and migrations.
- [ ] Link the guide from `README.md`.
- [ ] Run:

```bash
pnpm test:docker
git diff --check
```

- [ ] Commit:

```bash
git add docs/DOCKER.md README.md docker/docker-contract.test.ts
git commit -m "docs: 增加 Docker 运行指南"
```

## Task 2: Full non-Docker regression

- [ ] Run:

```bash
pnpm test:docker
pnpm validate
pnpm test:agent:all
pnpm test:prelaunch
pnpm test:note-highlights
pnpm test:note-editor
pnpm test:daily-brief
pnpm test:price-history
pnpm test:trade
pnpm build
```

Expected: every command exits `0`. Record exact pass counts in the handoff file.

## Task 3: Full Docker verification

- [ ] Parse all Compose files:

```bash
docker compose -f docker-compose.dev.yml config
docker compose --env-file .env.production -f docker-compose.yml config
docker compose --env-file .env.production -f docker-compose.tools.yml config
```

- [ ] Rebuild production without cache:

```bash
docker compose --env-file .env.production -f docker-compose.yml build --no-cache
```

- [ ] Start production and verify:

```bash
pnpm docker:prod
docker compose --env-file .env.production -f docker-compose.yml ps
curl -fsS http://localhost:8080/
curl -fsS http://localhost:8080/api/health
docker compose --env-file .env.production -f docker-compose.yml logs --no-color web server
```

- [ ] Confirm:
  - server is healthy;
  - only Nginx publishes a port;
  - logs do not contain credentials, tokens, or environment dumps.

- [ ] Re-run:

```bash
pnpm docker:build:weapp
pnpm docker:build:tt
test -f dist/app.json
test -f dist-tt/app.json
```

- [ ] Stop containers:

```bash
pnpm docker:prod:down
pnpm docker:dev:down
```

## Task 4: Final handoff preparation

- [ ] Complete every section in
  `docs/superpowers/HANDOFF-dockerization-2026-06-21.md`.
- [ ] Include:
  - branch and commit list;
  - files created/modified;
  - exact commands and results;
  - Docker versions;
  - image names/sizes;
  - port and health evidence;
  - mini-program output evidence;
  - known limitations;
  - whether `.env.production` and migrations were supplied/applied.
- [ ] Run:

```bash
git status --short
git diff --check
git log --oneline --decorate -12
git ls-files '.env.local' '.env.production'
```

Expected: no secret environment file is tracked.

- [ ] Commit only documentation/evidence changes:

```bash
git add docs/superpowers/HANDOFF-dockerization-2026-06-21.md
git commit -m "docs: 记录 Docker 化验收结果"
```

If a verification defect required code correction, commit it separately first:

```bash
git add <docker-scope-corrected-files>
git commit -m "fix: 修正 Docker 运行验收问题"
```

## Batch Gate

- [ ] All non-Docker tests and builds pass.
- [ ] All Compose files parse.
- [ ] Clean production images build.
- [ ] Production H5 and `/api/health` work through one entry point.
- [ ] Both mini-program outputs exist and are separated.
- [ ] No secrets are tracked, baked into images, printed in logs, or bundled into H5.
- [ ] Documentation reflects actual commands and behavior.
- [ ] Shared handoff file is complete.

## Return to Original Agent

Do not merge, push, delete the worktree, or rewrite history unless the user explicitly asks. Return the integration branch and completed handoff file to the original Codex agent for independent code review, final verification, integration, and release closure.
