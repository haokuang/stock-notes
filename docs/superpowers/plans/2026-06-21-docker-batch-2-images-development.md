# Docker Batch 2 Images and Development Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this batch task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the multi-stage Docker image foundation and a working macOS-friendly H5/NestJS hot-reload development stack.

**Architecture:** One pnpm-based multi-stage Dockerfile supplies development and future production targets. Development Compose bind-mounts source while keeping dependency directories in named volumes, and the H5 proxy reaches NestJS through the Compose service network.

**Tech Stack:** Docker Engine/Desktop, Docker Compose v2, Node.js 22, pnpm 9, Taro/Vite, NestJS.

---

## Dependencies and Ownership

- Start from the completed Batch 1 integration branch.
- Docker Desktop or Docker Engine with Compose v2 is required.
- Canonical detailed steps: Tasks 3–4 in
  `docs/superpowers/plans/2026-06-21-docker-development-production.md`.
- Do not add production Nginx behavior in this batch; Batch 3 owns it.

## Files

**Create**

- `docker/docker-contract.test.ts`
- `Dockerfile`
- `.dockerignore`
- `docker-compose.dev.yml`

**Modify**

- `package.json`

## Task 1: Dockerfile and build-context safety

- [ ] Add the Dockerfile and ignore-rule contract tests from canonical Task 3.
- [ ] Run them and confirm RED.
- [ ] Create the canonical multi-stage `Dockerfile` with these targets:
  - `development`
  - `web-build`
  - `web-runtime`
  - `server-build`
  - `server-runtime`
  - `mini-build`
- [ ] Use Node 22, Corepack, pnpm 9, and `pnpm install --frozen-lockfile`.
- [ ] Keep the server runtime non-root with `USER node`.
- [ ] Add the server image health check against `/api/health`.
- [ ] Create `.dockerignore` with explicit exclusions for real environment files, Git data, dependencies, build output, local keys, and tool caches.
- [ ] Retain `.env.example` and `.env.production.example` through negated ignore entries.
- [ ] Run:

```bash
pnpm exec tsx --test docker/docker-contract.test.ts
docker build --target mini-build -t stock-notes-mini-build:test .
docker build --target server-runtime -t stock-notes-server:test .
docker run --rm --entrypoint sh stock-notes-server:test -c \
  "test ! -e /app/.env.local && test ! -e /app/.env.production"
```

Expected: tests and both independent target builds pass; secret files are absent.

- [ ] Commit:

```bash
git add Dockerfile .dockerignore docker/docker-contract.test.ts
git commit -m "feat: 增加多阶段 Docker 镜像"
```

## Task 2: Development Compose

- [ ] Add the development Compose contract test from canonical Task 4.
- [ ] Run it and confirm RED.
- [ ] Create `docker-compose.dev.yml` with `server-dev` and `web-dev`.
- [ ] Use:

```yaml
H5_PROXY_TARGET: http://server-dev:3000
CHOKIDAR_USEPOLLING: "true"
WATCHPACK_POLLING: "true"
```

- [ ] Start each service with `pnpm install --frozen-lockfile` followed by its existing pnpm development command so fresh named volumes are populated.
- [ ] Bind ports `3000:3000` and `5001:5001`.
- [ ] Use separate root/workspace dependency volumes per service.
- [ ] Add:

```json
"docker:dev": "docker compose -f docker-compose.dev.yml up --build",
"docker:dev:down": "docker compose -f docker-compose.dev.yml down"
```

- [ ] Run:

```bash
docker compose -f docker-compose.dev.yml config
pnpm test:docker
pnpm docker:dev
```

- [ ] Verify:
  - `http://localhost:5001` loads.
  - `http://localhost:3000/api/health` returns 200.
  - One reversible frontend edit triggers H5 rebuild.
  - One reversible backend edit triggers NestJS rebuild.

- [ ] Stop without deleting volumes:

```bash
pnpm docker:dev:down
```

- [ ] Commit:

```bash
git add docker-compose.dev.yml docker/docker-contract.test.ts package.json
git commit -m "feat: 增加 Docker 热更新开发环境"
```

## Batch Gate

- [ ] Dockerfile contract tests pass.
- [ ] Compose config parses.
- [ ] H5 and API are simultaneously available.
- [ ] Frontend and backend hot reload work on macOS.
- [ ] Restarting development does not require manual dependency installation.
- [ ] Real environment files are absent from the image.
- [ ] Existing `pnpm dev` remains unchanged.

## Handoff

Record image tags, container smoke results, hot-reload evidence, commit hashes, and any Docker Desktop-specific notes in the shared handoff file. Leave containers stopped and named dependency volumes intact for Batch 3.
