# Docker Development and Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reproducible Docker workflows for H5 and NestJS development/production, plus a one-command WeChat mini-program build, while preserving the existing non-Docker pnpm workflows.

> **Scope amendment (2026-06-21):** The user explicitly canceled Douyin Docker support. Do not add a `tt-build` Compose service, a `docker:build:tt` script, or Docker-produced `dist-tt` artifacts. The existing non-Docker `pnpm build:tt` workflow remains supported.

**Architecture:** Use one multi-stage `Dockerfile` with dedicated development, H5 build/runtime, server build/runtime, and mini-program build targets. Development uses bind-mounted source and isolated pnpm dependency volumes; production exposes only Nginx, which serves `dist-web` and proxies `/api` to an internal NestJS container. Supabase, TOS, model providers, Tavily, and database services remain external.

**Tech Stack:** Docker Engine, Docker Compose v2, Node.js 22, pnpm 9, Taro 4/Vite, NestJS 10, Nginx Alpine, Node built-in test runner via `tsx`.

---

## Five-Batch Handoff Index

For sequential execution by other agents, use these batch plans:

1. `2026-06-21-docker-batch-1-runtime-contracts.md`
2. `2026-06-21-docker-batch-2-images-development.md`
3. `2026-06-21-docker-batch-3-production-runtime.md`
4. `2026-06-21-docker-batch-4-mini-builds.md`
5. `2026-06-21-docker-batch-5-release-gate.md`

All batches must run serially on one integration branch because `package.json`,
Docker contract tests, and environment templates accumulate across batches.
Update `docs/superpowers/HANDOFF-dockerization-2026-06-21.md` after every batch.

## Execution Preconditions

- Execute this plan in an isolated worktree created with `superpowers:using-git-worktrees`; the current main workspace contains unrelated user changes in `package.json`, `.env.example`, `config/index.ts`, and other files.
- Use pnpm only. Do not run npm or yarn.
- Install Docker Desktop or Docker Engine with Compose v2 before Tasks 3–8. At plan-writing time, `docker` is not available in the current environment, so no container result has been pre-validated.
- Copy the real local configuration to `.env.local` for development.
- Before production verification, create `.env.production` from `.env.production.example` with real values. Never commit either real environment file.
- Do not run database migrations automatically from Docker startup.

## File Map

**Create:**

- `server/src/bootstrap/runtime-environment.ts` — load local fallback variables and validate required production server variables.
- `server/src/bootstrap/runtime-environment.test.ts` — unit tests for precedence and production validation.
- `server/src/app.controller.test.ts` — public health response contract.
- `scripts/validate-docker-env.mjs` — validate public build-time variables for H5 and mini-program builds.
- `scripts/validate-docker-env.test.ts` — tests for build-time variable validation.
- `docker/docker-contract.test.ts` — static contract tests for Dockerfile, Compose, Nginx, ignore rules, and scripts.
- `Dockerfile` — all development, build, and production runtime stages.
- `.dockerignore` — keep secrets and local artifacts out of Docker build context.
- `docker-compose.dev.yml` — H5 and NestJS hot-reload services.
- `docker-compose.yml` — production Nginx and NestJS services.
- `docker-compose.tools.yml` — one-shot WeChat build service.
- `docker/nginx.conf` — static file policy and `/api` proxy.
- `.env.production.example` — non-secret production variable template.
- `docs/DOCKER.md` — operating and troubleshooting guide.

**Modify:**

- `server/src/main.ts` — use the runtime environment helper and bind NestJS to `0.0.0.0`.
- `server/src/app.controller.ts` — make `/api/health` return a stable non-secret health object.
- `server/src/agent/agent-api.test.ts` — remove the old source-text assertion for direct dotenv loading.
- `config/index.ts` — make the H5 development proxy target configurable for Docker.
- `package.json` — add Docker tests and Docker operation scripts without replacing existing user scripts.
- `.gitignore` — ignore real production environment files while retaining the example.
- `README.md` — link to the Docker guide.

## Task 1: Runtime Environment and Health Contract

**Files:**

- Create: `server/src/bootstrap/runtime-environment.ts`
- Create: `server/src/bootstrap/runtime-environment.test.ts`
- Create: `server/src/app.controller.test.ts`
- Modify: `server/src/main.ts`
- Modify: `server/src/app.controller.ts`
- Modify: `server/src/agent/agent-api.test.ts`

- [ ] **Step 1: Write failing runtime environment tests**

Create `server/src/bootstrap/runtime-environment.test.ts`:

```ts
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  loadRuntimeEnvironment,
  validateProductionServerEnvironment,
} from './runtime-environment'

test('keeps injected values and fills missing values from a local env file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'stock-notes-env-'))
  const envFile = join(directory, '.env.local')
  writeFileSync(envFile, 'SUPABASE_URL=https://file.example\nTAVILY_API_KEY=file-key\n')
  const env: NodeJS.ProcessEnv = {
    SUPABASE_URL: 'https://injected.example',
  }

  loadRuntimeEnvironment(env, envFile)

  assert.equal(env.SUPABASE_URL, 'https://injected.example')
  assert.equal(env.TAVILY_API_KEY, 'file-key')
})

test('production validation accepts password or legacy database URL', () => {
  assert.doesNotThrow(() => validateProductionServerEnvironment({
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    SUPABASE_DB_PASSWORD: 'password',
  }))
  assert.doesNotThrow(() => validateProductionServerEnvironment({
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    SUPABASE_DB_URL: 'postgresql://example',
  }))
})

test('production validation lists missing names without printing secret values', () => {
  assert.throws(
    () => validateProductionServerEnvironment({
      NODE_ENV: 'production',
      SUPABASE_SERVICE_ROLE_KEY: 'must-not-appear',
    }),
    (error: Error) => {
      assert.match(error.message, /SUPABASE_URL/)
      assert.match(error.message, /SUPABASE_DB_PASSWORD or SUPABASE_DB_URL/)
      assert.doesNotMatch(error.message, /must-not-appear/)
      return true
    },
  )
})

test('development does not require production variables', () => {
  assert.doesNotThrow(() => validateProductionServerEnvironment({
    NODE_ENV: 'development',
  }))
})
```

- [ ] **Step 2: Write the failing health test**

Create `server/src/app.controller.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { AppController } from './app.controller'

test('health response is stable and contains no configuration values', () => {
  const controller = new AppController({ getHello: () => 'hello' } as never)
  const response = controller.getHealth()

  assert.equal(response.status, 'success')
  assert.equal(response.data.status, 'ok')
  assert.match(response.data.timestamp, /^\d{4}-\d{2}-\d{2}T/)
  assert.deepEqual(Object.keys(response.data).sort(), ['status', 'timestamp'])
})
```

Remove the obsolete test named `server bootstrap explicitly loads the repository .env.local file` and its now-unused `readFileSync`/`resolve` imports from `server/src/agent/agent-api.test.ts`. The new helper tests replace that source-text assertion with behavior tests.

- [ ] **Step 3: Run the tests to verify they fail**

Run:

```bash
pnpm exec tsx --test --tsconfig=server/tsconfig.json \
  server/src/bootstrap/runtime-environment.test.ts \
  server/src/app.controller.test.ts
```

Expected: FAIL because `runtime-environment.ts` does not exist and the current health payload is a string.

- [ ] **Step 4: Implement the runtime environment helper**

Create `server/src/bootstrap/runtime-environment.ts`:

```ts
import { config as loadEnvFile } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

function resolveDefaultLocalEnvPath(): string {
  const candidates = [
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '../.env.local'),
    resolve(__dirname, '../../.env.local'),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

export function loadRuntimeEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  envPath = resolveDefaultLocalEnvPath(),
): void {
  loadEnvFile({
    path: envPath,
    processEnv: env,
    override: false,
    quiet: true,
  })
}

export function validateProductionServerEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== 'production') return

  const missing: string[] = []
  if (!env.SUPABASE_URL?.trim()) missing.push('SUPABASE_URL')
  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY')
  }
  if (!env.SUPABASE_DB_PASSWORD?.trim() && !env.SUPABASE_DB_URL?.trim()) {
    missing.push('SUPABASE_DB_PASSWORD or SUPABASE_DB_URL')
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missing.join(', ')}`,
    )
  }
}
```

- [ ] **Step 5: Update bootstrap and health response**

At the top of `server/src/main.ts`, replace the direct dotenv/path imports and call with:

```ts
import {
  loadRuntimeEnvironment,
  validateProductionServerEnvironment,
} from '@/bootstrap/runtime-environment'

loadRuntimeEnvironment()
validateProductionServerEnvironment()
```

Change the listener and final log to:

```ts
await app.listen(port, '0.0.0.0')
console.log(`Server running on http://0.0.0.0:${port}`)
```

Delete the hard-coded second `Application is running on: http://localhost:3000` log.

Change `getHealth()` in `server/src/app.controller.ts` to:

```ts
@Public()
@Get('health')
getHealth(): {
  status: string
  data: { status: string; timestamp: string }
} {
  return {
    status: 'success',
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
  }
}
```

- [ ] **Step 6: Run focused and existing Agent tests**

Run:

```bash
pnpm exec tsx --test --tsconfig=server/tsconfig.json \
  server/src/bootstrap/runtime-environment.test.ts \
  server/src/app.controller.test.ts \
  server/src/agent/agent-api.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Build the server**

Run:

```bash
pnpm build:server
```

Expected: NestJS build exits `0`.

- [ ] **Step 8: Commit**

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

## Task 2: Public Build Environment and Docker Proxy Configuration

**Files:**

- Create: `scripts/validate-docker-env.mjs`
- Create: `scripts/validate-docker-env.test.ts`
- Modify: `config/index.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing build environment tests**

Create `scripts/validate-docker-env.test.ts`:

```ts
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import test from 'node:test'

const script = resolve(process.cwd(), 'scripts/validate-docker-env.mjs')

function run(mode: string, env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [script, mode], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...env },
  })
}

test('web mode requires public Supabase configuration', () => {
  const result = run('web', {})
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /SUPABASE_URL/)
  assert.match(result.stderr, /SUPABASE_ANON_KEY/)
})

test('web mode accepts public Supabase configuration', () => {
  const result = run('web', {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
  })
  assert.equal(result.status, 0, result.stderr)
})

test('mini mode requires an HTTPS project domain', () => {
  const missing = run('mini', { PROJECT_DOMAIN: '' })
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr, /PROJECT_DOMAIN/)

  const insecure = run('mini', { PROJECT_DOMAIN: 'http://localhost:3000' })
  assert.notEqual(insecure.status, 0)
  assert.match(insecure.stderr, /https/)

  const valid = run('mini', { PROJECT_DOMAIN: 'https://stock.test' })
  assert.equal(valid.status, 0, valid.stderr)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec tsx --test scripts/validate-docker-env.test.ts
```

Expected: FAIL because `scripts/validate-docker-env.mjs` does not exist.

- [ ] **Step 3: Implement the validator**

Create `scripts/validate-docker-env.mjs`:

```js
const mode = process.argv[2]

function fail(message) {
  console.error(message)
  process.exit(1)
}

function requireNames(names) {
  const missing = names.filter((name) => !process.env[name]?.trim())
  if (missing.length > 0) {
    fail(`Missing required build environment variables: ${missing.join(', ')}`)
  }
}

if (mode === 'web') {
  requireNames(['SUPABASE_URL', 'SUPABASE_ANON_KEY'])
} else if (mode === 'mini') {
  requireNames(['PROJECT_DOMAIN'])
  if (!process.env.PROJECT_DOMAIN.startsWith('https://')) {
    fail('PROJECT_DOMAIN must use https for a production mini-program build')
  }
} else {
  fail('Usage: node scripts/validate-docker-env.mjs <web|mini>')
}
```

- [ ] **Step 4: Make the H5 proxy target configurable**

In `config/index.ts`, change only the development proxy target:

```ts
proxy: {
  '/api': {
    target: process.env.H5_PROXY_TARGET || 'http://localhost:3000',
    changeOrigin: true,
  },
},
```

Do not change `Network` or introduce a hard-coded Docker hostname in application code.

- [ ] **Step 5: Add the Docker contract test script entry**

Merge this script into the existing `package.json` scripts object without deleting current scripts:

```json
"test:docker": "tsx --test scripts/validate-docker-env.test.ts docker/docker-contract.test.ts"
```

`docker/docker-contract.test.ts` will be created in Task 3; until then, run the focused validator test directly.

- [ ] **Step 6: Run focused validation**

Run:

```bash
pnpm exec tsx --test scripts/validate-docker-env.test.ts
pnpm validate
```

Expected: validator tests PASS and validation exits `0`.

- [ ] **Step 7: Commit**

```bash
git add scripts/validate-docker-env.mjs scripts/validate-docker-env.test.ts config/index.ts package.json
git commit -m "feat: 增加 Docker 构建环境校验"
```

## Task 3: Multi-Stage Dockerfile and Build Context Safety

**Files:**

- Create: `docker/docker-contract.test.ts`
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Write failing Dockerfile and ignore-rule contract tests**

Create `docker/docker-contract.test.ts` with the initial tests:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

test('Dockerfile provides development and minimal production targets', () => {
  const source = read('Dockerfile')
  for (const stage of [
    'development',
    'web-build',
    'web-runtime',
    'server-build',
    'server-runtime',
    'mini-build',
  ]) {
    assert.match(source, new RegExp(` AS ${stage}\\b`, 'i'))
  }
  assert.match(source, /pnpm install --frozen-lockfile/)
  assert.match(source, /USER node/)
  assert.match(source, /HEALTHCHECK/)
  assert.match(source, /validate-docker-env\.mjs web/)
})

test('Docker build context excludes secrets and generated artifacts', () => {
  const source = read('.dockerignore')
  for (const pattern of [
    '.env.local',
    '.env.production',
    'node_modules',
    'server/node_modules',
    'dist-web',
    'dist-tt',
    'server/dist',
    '.git',
  ]) {
    assert.ok(source.includes(pattern), `missing ${pattern}`)
  }
  assert.match(source, /!\.env\.production\.example/)
})
```

- [ ] **Step 2: Run the contract test to verify it fails**

Run:

```bash
pnpm exec tsx --test docker/docker-contract.test.ts
```

Expected: FAIL because `Dockerfile` and `.dockerignore` do not exist.

- [ ] **Step 3: Create the multi-stage Dockerfile**

Create `Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
COPY server/package.json ./server/package.json
RUN pnpm install --frozen-lockfile

FROM base AS development
COPY . .

FROM development AS web-build
ARG SUPABASE_URL
ARG SUPABASE_ANON_KEY
ENV NODE_ENV=production
ENV PROJECT_DOMAIN=
ENV SUPABASE_URL=$SUPABASE_URL
ENV SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
RUN node scripts/validate-docker-env.mjs web
RUN pnpm build:web

FROM nginx:1.27-alpine AS web-runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/dist-web /usr/share/nginx/html
EXPOSE 80

FROM development AS server-build
RUN pnpm build:server
RUN pnpm --filter server deploy --prod /opt/server
RUN cp -R server/dist /opt/server/dist

FROM node:22-bookworm-slim AS server-runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY --from=server-build --chown=node:node /opt/server ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["node", "dist/main.js"]

FROM development AS mini-build
```

The Nginx stage will not build successfully until `docker/nginx.conf` is added in Task 5. In this task, build and inspect the independent `server-runtime` and `mini-build` targets first.

- [ ] **Step 4: Create `.dockerignore`**

Create `.dockerignore`:

```dockerignore
.git
.github
.DS_Store
.idea
.vscode
.agents
.codex
.claude
.mcp.json

node_modules
server/node_modules
.pnpm-store
node-compile-cache

dist
dist-*
server/dist
build
coverage
*.log

.env
.env.local
.env.production
.env.*
!.env.example
!.env.production.example

project.private.config.json
key
.preview
.taro
```

- [ ] **Step 5: Run static contract tests**

Run:

```bash
pnpm exec tsx --test docker/docker-contract.test.ts
```

Expected: current Dockerfile and ignore-rule tests PASS.

- [ ] **Step 6: Build independent targets**

Run:

```bash
docker build --target mini-build -t stock-notes-mini-build:test .
docker build --target server-runtime -t stock-notes-server:test .
```

Expected: both builds exit `0`; dependency installation uses `pnpm install --frozen-lockfile`.

- [ ] **Step 7: Inspect the server image for secret files**

Run:

```bash
docker run --rm --entrypoint sh stock-notes-server:test -c \
  "test ! -e /app/.env.local && test ! -e /app/.env.production"
```

Expected: exit `0`.

- [ ] **Step 8: Commit**

```bash
git add Dockerfile .dockerignore docker/docker-contract.test.ts
git commit -m "feat: 增加多阶段 Docker 镜像"
```

## Task 4: Development Compose with Hot Reload

**Files:**

- Create: `docker-compose.dev.yml`
- Modify: `docker/docker-contract.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add a failing development Compose contract test**

Append to `docker/docker-contract.test.ts`:

```ts
test('development compose exposes hot-reload web and server services', () => {
  const source = read('docker-compose.dev.yml')
  assert.match(source, /web-dev:/)
  assert.match(source, /server-dev:/)
  assert.match(source, /"5001:5001"/)
  assert.match(source, /"3000:3000"/)
  assert.match(source, /H5_PROXY_TARGET: http:\/\/server-dev:3000/)
  assert.match(source, /CHOKIDAR_USEPOLLING: "true"/)
  assert.match(source, /WATCHPACK_POLLING: "true"/)
  assert.match(source, /pnpm dev:web/)
  assert.match(source, /pnpm dev:server/)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec tsx --test docker/docker-contract.test.ts
```

Expected: FAIL because `docker-compose.dev.yml` does not exist.

- [ ] **Step 3: Create the development Compose file**

Create `docker-compose.dev.yml`:

```yaml
services:
  server-dev:
    build:
      context: .
      target: development
    command: sh -c "pnpm install --frozen-lockfile && pnpm dev:server"
    env_file:
      - .env.local
    environment:
      NODE_ENV: development
      CHOKIDAR_USEPOLLING: "true"
      WATCHPACK_POLLING: "true"
    ports:
      - "3000:3000"
    volumes:
      - .:/app
      - server_root_node_modules:/app/node_modules
      - server_workspace_node_modules:/app/server/node_modules
    init: true
    stop_grace_period: 15s

  web-dev:
    build:
      context: .
      target: development
    command: sh -c "pnpm install --frozen-lockfile && pnpm dev:web"
    env_file:
      - .env.local
    environment:
      NODE_ENV: development
      H5_PROXY_TARGET: http://server-dev:3000
      CHOKIDAR_USEPOLLING: "true"
      WATCHPACK_POLLING: "true"
    depends_on:
      - server-dev
    ports:
      - "5001:5001"
    volumes:
      - .:/app
      - web_root_node_modules:/app/node_modules
      - web_workspace_node_modules:/app/server/node_modules
    init: true
    stop_grace_period: 15s

volumes:
  server_root_node_modules:
  server_workspace_node_modules:
  web_root_node_modules:
  web_workspace_node_modules:
```

- [ ] **Step 4: Add development operation scripts**

Merge into `package.json`:

```json
"docker:dev": "docker compose -f docker-compose.dev.yml up --build",
"docker:dev:down": "docker compose -f docker-compose.dev.yml down"
```

- [ ] **Step 5: Validate and start the development stack**

Run:

```bash
docker compose -f docker-compose.dev.yml config
pnpm exec tsx --test docker/docker-contract.test.ts
pnpm docker:dev
```

Expected:

- Compose config exits `0`.
- Contract tests PASS.
- H5 is available at `http://localhost:5001`.
- `http://localhost:3000/api/health` returns HTTP 200.

- [ ] **Step 6: Verify front-end and back-end hot reload**

Make a reversible whitespace-only change to one frontend source file and one backend source file, observe both watchers rebuild, then revert only those temporary verification edits.

Expected:

- `web-dev` logs a Taro/Vite rebuild.
- `server-dev` logs a NestJS rebuild and restart.
- Both URLs remain available after rebuild.

- [ ] **Step 7: Stop without deleting dependency volumes**

Run:

```bash
pnpm docker:dev:down
docker volume ls --format '{{.Name}}' | grep stock_notes
```

Expected: containers stop; project dependency volumes remain for the next start.

- [ ] **Step 8: Commit**

```bash
git add docker-compose.dev.yml docker/docker-contract.test.ts package.json
git commit -m "feat: 增加 Docker 热更新开发环境"
```

## Task 5: Production Nginx and Compose

**Files:**

- Create: `docker/nginx.conf`
- Create: `docker-compose.yml`
- Modify: `docker/docker-contract.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add failing production proxy contract tests**

Append to `docker/docker-contract.test.ts`:

```ts
test('nginx serves H5 and preserves the api prefix', () => {
  const source = read('docker/nginx.conf')
  assert.match(source, /root \/usr\/share\/nginx\/html;/)
  assert.match(source, /location \/api\//)
  assert.match(source, /proxy_pass http:\/\/server:3000;/)
  assert.doesNotMatch(source, /proxy_pass http:\/\/server:3000\//)
  assert.match(source, /client_max_body_size 50m;/)
  assert.match(source, /Cache-Control "no-cache"/)
  assert.match(source, /max-age=31536000, immutable/)
})

test('production compose exposes only nginx and waits for server health', () => {
  const source = read('docker-compose.yml')
  assert.match(source, /web:/)
  assert.match(source, /server:/)
  assert.match(source, /\$\{APP_PORT:-8080\}:80/)
  assert.match(source, /condition: service_healthy/)
  assert.match(source, /restart: unless-stopped/)

  const serverSection = source.split(/\n  web:/)[0]
  assert.doesNotMatch(serverSection, /\n    ports:/)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm exec tsx --test docker/docker-contract.test.ts
```

Expected: FAIL because production Nginx and Compose files do not exist.

- [ ] **Step 3: Create the Nginx configuration**

Create `docker/nginx.conf`:

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    client_max_body_size 50m;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript
        application/xml image/svg+xml;

    location /api/ {
        proxy_pass http://server:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location = /index.html {
        add_header Cache-Control "no-cache";
        try_files $uri =404;
    }

    location ~* \.[0-9a-f]{8,}\.(?:js|css|png|jpg|jpeg|gif|webp|svg|ico|woff2?)$ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    location ~* \.(?:js|css|png|jpg|jpeg|gif|webp|svg|ico|woff2?)$ {
        add_header Cache-Control "public, max-age=3600";
        try_files $uri =404;
    }

    location / {
        add_header Cache-Control "no-cache";
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 4: Create production Compose**

Create `docker-compose.yml`:

```yaml
services:
  server:
    build:
      context: .
      target: server-runtime
    env_file:
      - .env.production
    environment:
      NODE_ENV: production
      PORT: "3000"
    restart: unless-stopped
    init: true
    stop_grace_period: 30s
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - >-
          fetch('http://127.0.0.1:3000/api/health')
          .then((response) => { if (!response.ok) process.exit(1) })
          .catch(() => process.exit(1))
      interval: 10s
      timeout: 3s
      start_period: 20s
      retries: 5

  web:
    build:
      context: .
      target: web-runtime
      args:
        SUPABASE_URL: ${SUPABASE_URL}
        SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY}
    depends_on:
      server:
        condition: service_healthy
    ports:
      - "${APP_PORT:-8080}:80"
    restart: unless-stopped
    init: true
```

- [ ] **Step 5: Add production operation scripts**

Merge into `package.json`:

```json
"docker:prod:build": "docker compose --env-file .env.production -f docker-compose.yml build",
"docker:prod": "docker compose --env-file .env.production -f docker-compose.yml up -d",
"docker:prod:down": "docker compose --env-file .env.production -f docker-compose.yml down"
```

- [ ] **Step 6: Validate Nginx, Compose, and images**

Run:

```bash
docker run --rm -v "$PWD/docker/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  nginx:1.27-alpine nginx -t
docker compose --env-file .env.production -f docker-compose.yml config
pnpm test:docker
pnpm docker:prod:build
```

Expected:

- `nginx -t` reports successful syntax.
- Compose config exits `0`.
- Docker contract tests PASS.
- Both production images build.

- [ ] **Step 7: Start and smoke-test the production stack**

Run:

```bash
pnpm docker:prod
docker compose --env-file .env.production -f docker-compose.yml ps
curl -fsS http://localhost:8080/
curl -fsS http://localhost:8080/api/health
```

Expected:

- `server` is healthy.
- `web` is running.
- H5 returns HTML.
- `/api/health` returns the health envelope.
- `docker compose ps` shows no published host port for `server`.

- [ ] **Step 8: Verify proxy failure is a real failure**

Run:

```bash
docker compose --env-file .env.production -f docker-compose.yml stop server
curl -sS -o /dev/null -w '%{http_code}\n' \
  http://localhost:8080/api/health
docker compose --env-file .env.production -f docker-compose.yml start server
```

Expected: the request while the server is stopped returns `502`, then the server returns to healthy.

- [ ] **Step 9: Commit**

```bash
git add docker/nginx.conf docker-compose.yml docker/docker-contract.test.ts package.json
git commit -m "feat: 增加 Docker 生产运行环境"
```

## Task 6: One-Shot Mini-Program Builds and Production Template

**Files:**

- Create: `docker-compose.tools.yml`
- Create: `.env.production.example`
- Modify: `.gitignore`
- Modify: `.env.example`
- Modify: `docker/docker-contract.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add failing mini-build and environment-template contract tests**

Append to `docker/docker-contract.test.ts`:

```ts
test('tool compose builds WeChat without reintroducing Douyin Docker support', () => {
  const source = read('docker-compose.tools.yml')
  assert.match(source, /weapp-build:/)
  assert.match(source, /pnpm build:weapp/)
  assert.match(source, /\.\/dist:\/app\/dist/)
  assert.doesNotMatch(source, /tt-build:/)
  assert.doesNotMatch(source, /pnpm build:tt/)
})

test('production template contains names but no filled secrets', () => {
  const source = read('.env.production.example')
  for (const name of [
    'SUPABASE_URL=',
    'SUPABASE_ANON_KEY=',
    'SUPABASE_SERVICE_ROLE_KEY=',
    'SUPABASE_DB_PASSWORD=',
    'PROJECT_DOMAIN=',
  ]) {
    assert.ok(source.includes(name), `missing ${name}`)
  }
  assert.doesNotMatch(source, /sb_secret_|sbp_|eyJ[a-zA-Z0-9_-]+/)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm exec tsx --test docker/docker-contract.test.ts
```

Expected: FAIL because the tools Compose and production template do not exist.

- [ ] **Step 3: Create mini-program build services**

Create `docker-compose.tools.yml`:

```yaml
services:
  weapp-build:
    build:
      context: .
      target: mini-build
    command:
      - sh
      - -c
      - node scripts/validate-docker-env.mjs mini && pnpm build:weapp
    env_file:
      - .env.production
    environment:
      NODE_ENV: production
      OUTPUT_ROOT: /output
    volumes:
      - ./dist:/output

```

- [ ] **Step 4: Create the production environment template**

Create `.env.production.example` with the complete non-secret template:

```dotenv
# Public application entry points
APP_PORT=8080
PROJECT_DOMAIN=

# Public Supabase values embedded in H5/mini-program builds
SUPABASE_URL=
SUPABASE_ANON_KEY=

# Server-only Supabase values
SUPABASE_ACCESS_TOKEN=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_PASSWORD=
SUPABASE_DB_URL=
DB_CONNECTION_PROFILE=pooler-transaction
DEFAULT_USER_ID=

# Tushare
TUSHARE_TOKEN=

# Error alerts
RESEND_API_KEY=
ALERT_EMAIL=
ALERT_FROM_EMAIL=

# TOS object storage
COZE_BUCKET_ENDPOINT_URL=
COZE_BUCKET_NAME=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=cn-beijing

# Vision model
VISION_API_KEY=
VISION_BASE_URL=
VISION_MODEL=

# DeepSeek and stock Agent providers
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_FLASH_MODEL=deepseek-v4-flash
DEEPSEEK_PRO_MODEL=deepseek-v4-pro
AGENT_DEEPSEEK_MODEL=

OPENAI_API_KEY=
AGENT_OPENAI_MODEL=

MINIMAX_CREDENTIAL_MODE=api
MINIMAX_API_KEY=
MINIMAX_BASE_URL=
MINIMAX_CODING_PLAN_API_KEY=
MINIMAX_CODING_PLAN_BASE_URL=
AGENT_MINIMAX_MODEL=

# Agent web search and worker
TAVILY_API_KEY=
TAVILY_BASE_URL=https://api.tavily.com
AGENT_WORKER_CONCURRENCY=2
AGENT_WORKER_POLL_MS=1000
AGENT_RUN_LEASE_MS=45000

# Mini-program public identifiers
TARO_APP_WEAPP_APPID=
```

Keep `PROJECT_DOMAIN` blank in the committed template. A real production mini-program build must supply the actual registered HTTPS domain.

Add the currently supported `SUPABASE_DB_PASSWORD` and `DB_CONNECTION_PROFILE` names to `.env.example` if they are absent. Remove the duplicate DeepSeek heading/keys while preserving one canonical entry for every existing variable.

- [ ] **Step 5: Ignore the real production file**

Append to `.gitignore`:

```gitignore
.env.production
!.env.production.example
```

- [ ] **Step 6: Add mini-program operation scripts**

Merge into `package.json`:

```json
"docker:build:weapp": "docker compose --env-file .env.production -f docker-compose.tools.yml run --rm weapp-build"
```

- [ ] **Step 7: Run contract and Compose validation**

Run:

```bash
docker compose --env-file .env.production -f docker-compose.tools.yml config
pnpm test:docker
```

Expected: Compose config exits `0`; all Docker contract tests PASS.

- [ ] **Step 8: Build both mini-programs**

Run:

```bash
pnpm docker:build:weapp
test -f dist/app.json
```

Expected:

- The command exits `0`.
- WeChat output exists under `dist/`.
- No Douyin Docker command, service, or output is introduced.

- [ ] **Step 9: Verify invalid production domains fail**

Run:

```bash
PROJECT_DOMAIN=http://localhost:3000 \
  docker compose --env-file .env.production -f docker-compose.tools.yml \
  run --rm -e PROJECT_DOMAIN=http://localhost:3000 weapp-build
```

Expected: non-zero exit with `PROJECT_DOMAIN must use https`; no success message.

- [ ] **Step 10: Commit**

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

## Task 7: Docker Operations Documentation

**Files:**

- Create: `docs/DOCKER.md`
- Modify: `README.md`
- Modify: `docker/docker-contract.test.ts`

- [ ] **Step 1: Add a failing documentation contract test**

Append to `docker/docker-contract.test.ts`:

```ts
test('Docker guide covers required workflows and troubleshooting', () => {
  const source = read('docs/DOCKER.md')
  for (const text of [
    'pnpm docker:dev',
    'pnpm docker:prod:build',
    'pnpm docker:build:weapp',
    '/api/health',
    '502',
    'PROJECT_DOMAIN',
    'Docker Compose v2',
  ]) {
    assert.ok(source.includes(text), `missing documentation for ${text}`)
  }
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm exec tsx --test docker/docker-contract.test.ts
```

Expected: FAIL because `docs/DOCKER.md` does not exist.

- [ ] **Step 3: Write `docs/DOCKER.md`**

Create `docs/DOCKER.md` with this complete operating guide:

````md
# Docker 运行指南

## 前置要求

- Docker Desktop 或 Docker Engine
- Docker Compose v2
- 项目命令统一使用 pnpm

确认环境：

```bash
docker --version
docker compose version
pnpm --version
```

## 本地开发

准备根目录 `.env.local`，然后启动：

```bash
pnpm docker:dev
```

- H5：`http://localhost:5001`
- API 健康检查：`http://localhost:3000/api/health`

前后端源码会挂载进容器。macOS 下已启用轮询监听，保存代码后应自动重建。

停止服务但保留依赖缓存：

```bash
pnpm docker:dev:down
```

## 生产环境变量

```bash
cp .env.production.example .env.production
```

填写真实配置。`.env.production` 不得提交。

- H5 会公开 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`。
- Service Role、数据库密码、TOS 和模型密钥只进入后端容器。
- `PROJECT_DOMAIN` 是小程序访问 API 的真实 HTTPS 域名。
- `APP_PORT` 默认是 `8080`。

## 生产构建与启动

```bash
pnpm docker:prod:build
pnpm docker:prod
```

访问：

```bash
curl http://localhost:8080/
curl http://localhost:8080/api/health
```

停止：

```bash
pnpm docker:prod:down
```

## 单域名与 HTTPS 网关

生产容器只公开 Nginx。H5 使用同域 `/api`，Nginx 将其转发至内部 NestJS 服务。

本项目第一版不管理 TLS 证书。请让服务器现有网关或云负载均衡终止 HTTPS，再转发到 `APP_PORT`。

## 微信小程序构建

先在 `.env.production` 填入已在微信平台登记的 HTTPS `PROJECT_DOMAIN`：

```bash
pnpm docker:build:weapp
```

产物写入 `dist/`，可导入微信开发者工具。该命令不自动上传或发布。

## 抖音小程序

抖音 Docker 构建已明确取消。需要抖音产物时继续使用现有非 Docker 命令 `pnpm build:tt`。

## 日志与健康检查

```bash
docker compose --env-file .env.production -f docker-compose.yml ps
docker compose --env-file .env.production -f docker-compose.yml logs -f web server
curl http://localhost:8080/api/health
```

健康接口只表示 NestJS 可响应和基础配置已加载，不把第三方模型短暂故障当成容器死亡。

## 停止、重建与依赖缓存

生产无缓存重建：

```bash
docker compose --env-file .env.production -f docker-compose.yml build --no-cache
```

开发依赖 volume 默认保留。只有需要彻底重装依赖时才执行：

```bash
docker compose -f docker-compose.dev.yml down --volumes
```

该命令会删除本项目开发容器的依赖缓存。

## 常见故障

### 端口被占用

检查 `5001`、`3000` 或 `APP_PORT`，停止占用进程或修改生产端口。

### 保存代码后没有重建

确认通过 `docker-compose.dev.yml` 启动，并检查 `CHOKIDAR_USEPOLLING` 和 `WATCHPACK_POLLING` 是否为 `true`。

### Nginx 返回 502

`502` 表示 Nginx 无法连接健康的 NestJS 服务：

```bash
docker compose --env-file .env.production -f docker-compose.yml ps
docker compose --env-file .env.production -f docker-compose.yml logs server
```

### 缺少环境变量

后端会列出缺少的变量名；生产 H5 缺少公开 Supabase 配置会停止构建；小程序缺少 HTTPS `PROJECT_DOMAIN` 也会停止构建。

### 数据库结构缺失

Docker 启动不会自动执行数据库迁移。请先按项目现有 Supabase 发布流程应用 `server/migrations/`。

### 构建产物位置

- H5 位于生产 Nginx 镜像内。
- 微信小程序位于宿主机 `dist/`。
- 抖音 Docker 构建不在本项目范围内。
````

- [ ] **Step 4: Link the guide from `README.md`**

Add a short “Docker” subsection near the existing development instructions:

```md
### Docker

开发、生产部署及微信小程序的一键构建说明见
[Docker 运行指南](docs/DOCKER.md)。
```

- [ ] **Step 5: Run documentation contracts**

Run:

```bash
pnpm test:docker
git diff --check
```

Expected: tests PASS; no whitespace errors.

- [ ] **Step 6: Commit**

```bash
git add docs/DOCKER.md README.md docker/docker-contract.test.ts
git commit -m "docs: 增加 Docker 运行指南"
```

## Task 8: Full Verification and Release Evidence

**Files:**

- Modify only if verification exposes a defect in a file from Tasks 1–7.

- [ ] **Step 1: Verify repository tests and builds outside Docker**

Run:

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

Expected: every command exits `0`. Database-backed tests require the existing valid local Supabase configuration.

- [ ] **Step 2: Verify all Compose files parse**

Run:

```bash
docker compose -f docker-compose.dev.yml config
docker compose --env-file .env.production -f docker-compose.yml config
docker compose --env-file .env.production -f docker-compose.tools.yml config
```

Expected: all three commands exit `0` with no missing interpolation values.

- [ ] **Step 3: Rebuild production images from scratch**

Run:

```bash
docker compose --env-file .env.production -f docker-compose.yml build --no-cache
```

Expected: H5 and server images build from the lockfile with no secret file copied into the context.

- [ ] **Step 4: Run final production smoke checks**

Run:

```bash
pnpm docker:prod
docker compose --env-file .env.production -f docker-compose.yml ps
curl -fsS http://localhost:8080/
curl -fsS http://localhost:8080/api/health
docker compose --env-file .env.production -f docker-compose.yml logs --no-color web server
```

Expected:

- H5 and health endpoint return successfully.
- Server is healthy.
- Logs contain no secrets, access tokens, or environment dumps.
- Only Nginx publishes a host port.

- [ ] **Step 5: Re-run both mini-program builds**

Run:

```bash
pnpm docker:build:weapp
test -f dist/app.json
```

Expected: the WeChat build directory contains valid project output, and no Douyin Docker command exists.

- [ ] **Step 6: Stop all verification containers**

Run:

```bash
pnpm docker:prod:down
pnpm docker:dev:down
```

Expected: project containers are stopped; dependency volumes remain.

- [ ] **Step 7: Review the final diff and commits**

Run:

```bash
git status --short
git diff --check
git log --oneline --decorate -8
```

Expected:

- No accidental `.env.local` or `.env.production` is tracked.
- No unrelated user file is included.
- Each task has its focused conventional commit.

- [ ] **Step 8: Commit any verification-only corrections**

Only if a correction was required:

```bash
git add <only-files-corrected-from-tasks-1-through-7>
git commit -m "fix: 修正 Docker 运行验收问题"
```

If no correction was required, do not create an empty commit.

## Final Acceptance Checklist

- [ ] `pnpm docker:dev` starts H5 on `5001` and NestJS on `3000`.
- [ ] Frontend and backend edits hot reload on macOS Docker.
- [ ] Production exposes one Nginx port and keeps NestJS internal.
- [ ] `/api` reaches NestJS without losing or duplicating the prefix.
- [ ] `/api/health` is public, stable, and non-secret.
- [ ] Production H5 build rejects missing public Supabase values.
- [ ] Production mini-program build rejects a missing or non-HTTPS API domain.
- [ ] WeChat output is written to the host `dist/` directory and Douyin Docker support remains absent.
- [ ] Real secret files do not enter Git, image layers, or H5 bundles.
- [ ] Existing non-Docker pnpm workflows still pass.
- [ ] Documentation covers development, production, mini-programs, health, logs, and troubleshooting.
