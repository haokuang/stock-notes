# Docker Batch 3 Production Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this batch task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the production H5 and NestJS runtime behind one Nginx entry point with health-aware startup, correct `/api` proxying, caching, compression, and restart behavior.

**Architecture:** The H5 build becomes an Nginx runtime image. NestJS remains internal to the Compose network; Nginx alone publishes a host port and proxies `/api` without stripping or duplicating the global prefix.

**Tech Stack:** Docker Compose v2, Nginx Alpine, Taro H5 production build, NestJS.

---

## Dependencies and Ownership

- Start from completed Batches 1–2.
- A real local `.env.production` is required for runtime smoke testing and must remain untracked.
- Canonical detailed steps: Task 5 in
  `docs/superpowers/plans/2026-06-21-docker-development-production.md`.

## Files

**Create**

- `docker/nginx.conf`
- `docker-compose.yml`

**Modify**

- `docker/docker-contract.test.ts`
- `package.json`

## Task 1: Production proxy contracts

- [ ] Add the Nginx and production Compose tests from canonical Task 5.
- [ ] Run `pnpm exec tsx --test docker/docker-contract.test.ts` and confirm RED.
- [ ] Ensure tests require:
  - Nginx static root.
  - `location /api/`.
  - `proxy_pass http://server:3000;` without a trailing slash.
  - 50 MB request-body limit.
  - no-cache HTML policy.
  - immutable caching only for hashed assets.
  - `service_healthy` startup dependency.
  - no host port on `server`.

## Task 2: Nginx and production Compose

- [ ] Create `docker/nginx.conf` from canonical Task 5.
- [ ] Keep `/api` intact through the proxy.
- [ ] Enable gzip, forwarded headers, upload limit, proxy timeouts, and SPA fallback.
- [ ] Cache hashed assets for one year; cache unhashed assets for one hour; do not cache HTML.
- [ ] Create `docker-compose.yml` with:
  - internal `server`;
  - public `web`;
  - `restart: unless-stopped`;
  - health-aware dependency;
  - `${APP_PORT:-8080}:80`.
- [ ] Add:

```json
"docker:prod:build": "docker compose --env-file .env.production -f docker-compose.yml build",
"docker:prod": "docker compose --env-file .env.production -f docker-compose.yml up -d",
"docker:prod:down": "docker compose --env-file .env.production -f docker-compose.yml down"
```

## Task 3: Production gate

- [ ] Run:

```bash
docker run --rm -v "$PWD/docker/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  nginx:1.27-alpine nginx -t
docker compose --env-file .env.production -f docker-compose.yml config
pnpm test:docker
pnpm docker:prod:build
pnpm docker:prod
```

- [ ] Verify:

```bash
docker compose --env-file .env.production -f docker-compose.yml ps
curl -fsS http://localhost:8080/
curl -fsS http://localhost:8080/api/health
```

Expected: H5 and health endpoint succeed; server is healthy; only Nginx publishes a host port.

- [ ] Stop the server and verify the proxy returns 502:

```bash
docker compose --env-file .env.production -f docker-compose.yml stop server
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/health
docker compose --env-file .env.production -f docker-compose.yml start server
```

- [ ] Commit:

```bash
git add docker/nginx.conf docker-compose.yml docker/docker-contract.test.ts package.json
git commit -m "feat: 增加 Docker 生产运行环境"
```

## Batch Gate

- [ ] Nginx syntax and Compose parsing pass.
- [ ] Production images build from the lockfile.
- [ ] H5 and `/api/health` share one public origin.
- [ ] NestJS has no published host port.
- [ ] API prefix is neither stripped nor duplicated.
- [ ] Nginx returns 502 when NestJS is unavailable.
- [ ] Server restarts and becomes healthy again.

## Handoff

Record the public port, image build result, health transition, 502 test, commit hash, and any production environment names that needed correction. Stop production containers before Batch 4.
