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

test('development compose pins linux/amd64 and restores host lockfile on soft exit', () => {
  // Taro 4.1.9 / @swc/core 1.3.96 / @tarojs/plugin-doctor 不发布 linux-arm64-gnu binding,
  // 只发布 darwin-arm64/darwin-x64/linux-x64-gnu/win32-x64-msvc。
  // Docker Desktop on Apple Silicon 默认拉 arm64 镜像,即使强制 platform 也找不到对应 binding。
  // 因此 dev Compose 必须:
  //   1. 强制 platform: linux/amd64(x86_64 glibc),让 pnpm 能解析到 linux-x64-gnu binding;
  //   2. 在容器内用 `pnpm install --no-frozen-lockfile` 重新生成 lockfile,补全当前架构的 binding;
  //   3. trap EXIT/INT/TERM/HUP 在容器软退出时把宿主机原始 lockfile 还原回 bind mount,
  //      避免污染开发者工作区。
  //   关键约束:pnpm dev:server 必须作为 shell 子进程启动(不 exec),原 shell 进程的 trap 表
  //   才能在 SIGTERM/SIGINT 下被触发;exec 替换 PID 1 后 trap 不可靠(原 Apple Silicon 修复的缺陷)。
  //   已知限制:docker kill -9 / 宿主机断电场景 trap 不会执行,host lockfile 不会被还原。
  const source = read('docker-compose.dev.yml')
  const platformMatches = source.match(/platform: linux\/amd64/g) ?? []
  assert.ok(
    platformMatches.length >= 2,
    `expected platform: linux/amd64 for both server-dev and web-dev, found ${platformMatches.length}`,
  )
  // 必须备份/还原宿主机 lockfile,避免 lockfile 被容器内重新生成的版本覆盖。
  const backupCount = (source.match(/cp pnpm-lock\.yaml \/tmp\/pnpm-lock\.yaml\.host\.bak/g) ?? []).length
  const restoreCount = (source.match(/cp \/tmp\/pnpm-lock\.yaml\.host\.bak \/app\/pnpm-lock\.yaml/g) ?? []).length
  assert.ok(
    backupCount >= 2,
    `expected pnpm-lock.yaml backup for both services, found ${backupCount}`,
  )
  assert.ok(
    restoreCount >= 2,
    `expected pnpm-lock.yaml restore trap for both services, found ${restoreCount}`,
  )
  // trap 必须覆盖 EXIT/INT/TERM(以及常见的 HUP),不能在 pnpm dev 启动命令前 exec。
  const fullTrapCount = (
    source.match(/trap\s+['"][^'"]*['"]\s+EXIT\s+INT\s+TERM(\s+HUP)?/g) ?? []
  ).length
  assert.ok(
    fullTrapCount >= 2,
    `expected trap covering EXIT/INT/TERM[/HUP] for both services, found ${fullTrapCount}`,
  )
  // 必须用 --no-frozen-lockfile 重新生成 lockfile,补全 linux-x64-gnu binding。
  const reinstallCount = (source.match(/pnpm install --no-frozen-lockfile/g) ?? []).length
  assert.ok(
    reinstallCount >= 2,
    `expected --no-frozen-lockfile reinstall for both services, found ${reinstallCount}`,
  )
  // 启动 pnpm dev 的命令块中必须不含 `exec `,否则 trap 会被替换掉。
  // 简单断言:在 sh -c 字符串里,pnpm dev 之前不能出现 `exec `。
  const commandBlocks = source.match(/- sh\n\s+- -c\n\s+- \|[\s\S]*?(?=\n    \S|\n[a-z]|\Z)/g) ?? []
  for (const block of commandBlocks) {
    assert.ok(
      !/^\s*exec\s+pnpm\s+dev/m.test(block),
      'pnpm dev:server / dev:web must not be started with `exec`; trap would be lost',
    )
  }
})

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
  // Taro 4.1.9 / @swc/core 不发布 linux-arm64-gnu binding,两个 service 都必须
  // 强制 linux/amd64,否则在 Apple Silicon 等 arm64 主机上启动会失败。
  const platformMatches = source.match(/platform: linux\/amd64/g) ?? []
  assert.ok(
    platformMatches.length >= 2,
    `expected platform: linux/amd64 for both server and web, found ${platformMatches.length}`,
  )

  const serverSection = source.split(/\n  web:/)[0]
  assert.doesNotMatch(serverSection, /\n    ports:/)
})
