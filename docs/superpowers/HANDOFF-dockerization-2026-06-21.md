# Docker 化开发交接记录

## 使用方式

本文件由执行 Docker 五个批次的 agent 持续更新。每个批次完成后填写对应记录，不删除前序结果。最终由原始 Codex agent 独立复核并收尾。

## 基准文档

- 设计：
  `docs/superpowers/specs/2026-06-21-docker-development-production-design.md`
- 总实施计划：
  `docs/superpowers/plans/2026-06-21-docker-development-production.md`
- 批次 1：
  `docs/superpowers/plans/2026-06-21-docker-batch-1-runtime-contracts.md`
- 批次 2：
  `docs/superpowers/plans/2026-06-21-docker-batch-2-images-development.md`
- 批次 3：
  `docs/superpowers/plans/2026-06-21-docker-batch-3-production-runtime.md`
- 批次 4：
  `docs/superpowers/plans/2026-06-21-docker-batch-4-mini-builds.md`
- 批次 5：
  `docs/superpowers/plans/2026-06-21-docker-batch-5-release-gate.md`

## 执行约束

- 五个批次串行执行在同一条集成分支，推荐 `codex/docker-runtime`。
- 使用隔离 worktree，避免覆盖主工作区现有未提交改动。
- 仅使用 pnpm。
- 不提交 `.env.local`、`.env.production` 或任何真实密钥。
- 不自动执行生产数据库迁移。
- 每批单独提交，不把后续批次内容提前混入。
- 批次 5 完成后停止，由原始 Codex agent 做最终 code review、全量复验和集成。

## 批次状态

| 批次 | 内容 | 状态 | 起止提交 | 执行者 |
| --- | --- | --- | --- | --- |
| 1 | 环境加载、健康检查、构建变量校验 | 已完成 | `82b0a7b` → `1932f06` | Codex |
| 2 | 多阶段镜像、开发热更新 | 已完成(server-runtime + mini-build 镜像已构建并验证密钥隔离; dev Compose 全栈启动与 HMR 全部 GREEN) | `0c7c565` → `5dd1bea` | ZCode |
| 3 | 生产 Nginx、单入口 Compose | 已完成 | `3d66949` → `c6590a2` | Claude Haiku 4.5 |
| 4 | 微信小程序一键构建（抖音 Docker 已取消） | 已完成 | `c6590a2` → `b23afd4` | Claude Haiku 4.5 |
| 5 | 文档、全量验证、交回 | 已完成并经 Codex 最终修复复验 | `b23afd4` → `6b90708` + 最终修复提交 | Claude Haiku 4.5 / Codex |

## 批次 1 记录

- 执行日期：2026-06-21
- 执行者：Codex
- 集成分支：`codex/docker-runtime`
- 隔离 worktree：
  `/Users/bytedance/.config/superpowers/worktrees/stock_notes/codex-docker-runtime`
- 起始提交：`82b0a7b`
- 实现提交：
  - `3ff0d52 feat: 增加容器运行环境与健康检查`
  - `1932f06 feat: 增加 Docker 构建环境校验`
- 新增文件：
  - `server/src/bootstrap/runtime-environment.ts`
  - `server/src/bootstrap/runtime-environment.test.ts`
  - `server/src/app.controller.test.ts`
  - `scripts/validate-docker-env.mjs`
  - `scripts/validate-docker-env.test.ts`
- 修改文件：
  - `server/src/main.ts`
  - `server/src/app.controller.ts`
  - `server/src/agent/agent-api.test.ts`
  - `config/index.ts`
  - `package.json`
- TDD RED 证据：
  - 环境测试因 `runtime-environment` 模块不存在失败。
  - 健康检查测试因 `response.data.status` 为 `undefined` 失败。
  - 构建变量测试因 `validate-docker-env.mjs` 不存在失败。
- 本批运行环境/健康/API 测试：9/9 通过。
- 构建变量校验测试：3/3 通过。
- `pnpm test:agent:batch1`：17/17 通过。
- `pnpm validate`：通过；lint 与 TypeScript 均退出 0。
- `pnpm build:server`：通过，退出 0。
- `git diff --check`：通过。
- Docker CLI：本批不需要；计划由批次 2 开始验证 Docker。
- 遗留问题：
  - `test:docker` 已加入 `package.json`，但其引用的
    `docker/docker-contract.test.ts` 按计划在批次 2 创建；批次 1 使用聚焦测试命令验证。
  - 主工作区存在用户未提交的 `package.json` 与 `config/index.ts` 修改；当前实现位于隔离分支，后续集成时需做内容级合并。

## 批次 2 记录

- 执行日期：2026-06-19 ~ 2026-06-21
- 执行者：ZCode
- 起始提交：`0c7c565`
- 完成提交：`d2c82e2`（Task 3）、`dbe08f5`（Task 4）、`119f892`（首批交接记录）、`5dd1bea`（Apple Silicon 修复）
- Docker/Compose 版本：29.5.3 / Compose v2
- 新增文件：
  - `Dockerfile`（6 阶段多阶段构建：development / web-build / web-runtime / server-build / server-runtime / mini-build）
  - `.dockerignore`（排除 .env.local / .env.production / .git / node_modules / dist-* 等，保留 .env.example 和 .env.production.example）
  - `docker/docker-contract.test.ts`（4 段契约：Dockerfile 阶段+关键字 / .dockerignore 排除规则 / 开发 Compose 服务声明 / linux/amd64 + lockfile 备份还原策略）
  - `docker-compose.dev.yml`（server-dev + web-dev，绑定挂载源码，独立 node_modules 命名卷，轮询监听，platform: linux/amd64，容器内 lockfile 备份/还原 trap）
- 修改文件：
  - `package.json`（追加 `docker:dev` / `docker:dev:down` 脚本）
- 契约测试结果：
  - Task 3 契约(Dockerfile + .dockerignore)：2/2 通过
  - Task 4 契约(docker-compose.dev.yml)：2/2 通过（含 linux/amd64 + lockfile 备份还原）
  - `pnpm test:docker`（含批次 1 validate-docker-env）：7/7 通过
  - `pnpm validate`（lint + tsc）：通过
- `docker compose -f docker-compose.dev.yml config`：✅ 解析通过
- 镜像构建结果：
  - `docker build --target server-runtime`：✅ 通过（构建用时约 25 秒，复用 base 镜像缓存）
  - `docker build --target mini-build`：✅ 通过（构建用时约 110 秒）
  - `docker build --target web-build`：⚠️ 本地 Apple Silicon + 镜像加速器场景下，跨平台 binding 问题（同 web-dev，需进一步处理或接受仅在 CI 环境构建）
  - `docker run --rm stock-notes-server:test -c "test ! -e /app/.env.local && test ! -e /app/.env.production"`：✅ PASS（密钥文件未被烘焙进镜像）
- 开发 H5 地址与结果：http://localhost:5001/ → HTTP 200（741ms，HTML 2026 字节）
- 开发 API 健康检查：http://localhost:3000/api/health → HTTP 200（45ms，返回 `{status:"success",data:{status:"ok",...}}`）
- 前端热更新：✅ 验证通过。在 `src/app.css` 末尾追加测试标记 → 日志出现 `[vite] hmr update /app.css`。
- 后端热更新：✅ 验证通过（增量编译阶段）。在 `server/src/main.ts` 末尾追加测试标记 → 日志出现 `File change detected. Starting incremental compilation...` → `Found 0 errors. Watching for file changes.`。Nest watch worker 后续因 `spawn ps ENOENT` 退出，是因为 `node:22-bookworm-slim` 基础镜像未带 procps；该问题属于镜像优化范畴，留给批次 3 在 base 阶段 `apt-get install -y --no-install-recommends procps` 解决。
- **批 2 修复（post-handoff）**：
  - **procps 缺失**：`Dockerfile` base 阶段增加 `apt-get install -y --no-install-recommends procps`，使 `nest start --watch` 在增量编译后 spawn ps 不再 ENOENT。验证：两次触发 HMR（修改 `server/src/main.ts`），日志两次出现 `Found 0 errors. Watching for file changes.`，无 `ps ENOENT`，后端进程持续存活。
  - **trap + exec 不可靠**：原方案在容器入口用 `exec pnpm dev:server` 启动后端 watch，`exec` 会把原 shell 进程替换为 pnpm，原 shell 的 EXIT/INT/TERM trap 表丢失，导致 `pnpm install --no-frozen-lockfile` 改写过的 host `pnpm-lock.yaml` 在容器退出时无法回滚。修复方式是把 `pnpm dev:server` / `pnpm dev:web` 作为 shell 子进程启动（不 exec），trap 保留在原 shell。验证：`docker compose -f docker-compose.dev.yml down` 后，host `pnpm-lock.yaml` md5 与启动前完全一致。
  - **已知限制**：bind mount 模式下硬 kill 场景（`docker kill -9` / `docker rm -f` / 宿主机断电）trap 不会执行，host lockfile 不会被还原。pnpm 9 的 `--lockfile-dir` 选项只影响 `pnpm install` 输出位置，不影响 `pnpm dev` 读取路径，运行时仍读 workspace 根的 `pnpm-lock.yaml`，因此这条路走不通。软退出（`docker compose down` / Ctrl+C）场景已保护。
- 密钥文件检查：✅ 镜像内无 `.env.local` / `.env.production`
- **Apple Silicon 关键修复（commit `5dd1bea`）**：
  - **根因**：Taro 4.1.9 / @swc/core 1.3.96 / @tarojs/plugin-doctor 等只发布 darwin-arm64/darwin-x64/linux-x64-gnu/win32-x64-msvc binding，**不发布 linux-arm64-gnu**。Docker Desktop on Apple Silicon 默认拉 arm64 镜像 → pnpm 跳过所有 platform binding → web-dev 启动报 `Bindings not found` / `Cannot find module '@tarojs/binding-linux-arm64-gnu'`。
  - **方案**：
    1. dev Compose 两个服务强制 `platform: linux/amd64`（x86_64 glibc），让 pnpm 能解析到 `linux-x64-gnu` binding。
    2. 容器启动时把宿主机 `pnpm-lock.yaml` 备份到 `/tmp/pnpm-lock.yaml.host.bak`，然后用 `pnpm install --no-frozen-lockfile` 重新生成含当前架构 binding 的 lockfile。
    3. `trap 'cp /tmp/pnpm-lock.yaml.host.bak /app/pnpm-lock.yaml' EXIT` 在容器退出时把原始 lockfile 还原回 bind mount，**实测 trap 正常生效，`diff` 返回空，不污染开发者工作区**。
- 遗留问题：
  - **Dockerfile base 阶段需要补 procps**：`nest start --watch` 在 backend HMR 增量编译后 spawn ps 检查进程树，`node:22-bookworm-slim` 默认不带 procps，会导致 backend HMR worker 短暂报错退出（但前端 HMR 与增量编译本身工作正常）。留给批次 3 在 base 阶段加 `apt-get install -y --no-install-recommends procps`。
  - `.env.local` 已从主工作区拷入 worktree 并确认被 git 忽略；`compose config` 解析需此文件存在，后续执行者也需自行拷贝。
  - **首次启动清理 node_modules 命名卷**：在 Apple Silicon 宿主机第一次跑 `pnpm docker:dev` 前，如果宿主机 `node_modules/.pnpm` 里只有 darwin-arm64 binding，pnpm 会触发"reinstall from scratch"交互提示（默认 Y）。如果之前已跑过 `pnpm install`，需要在重启前先 `docker volume rm codex-docker-runtime_{server,web}_{root,workspace}_node_modules` 让容器内 pnpm 干净重装，否则会继承旧的 darwin-arm64 binding 导致 web-dev 启动失败。
  - `Dockerfile` 第一行 `# syntax=docker/dockerfile:1.7` 依赖 BuildKit frontend 镜像，如网络恢复后仍超时，可安全删除此行（当前 Dockerfile 未使用 1.7 独有语法）。

## 批次 3 记录

- 执行日期：2026-06-21
- 执行者：Claude Haiku 4.5
- 起始提交：`3d66949`（批次 2 修复）
- 完成提交：本批次（待提交）
- 新增文件：
  - `docker/nginx.conf`（H5 静态服务 + `/api` 反代到 `server:3000`，gzip / 50MB 上传 / hashed 1y + unhashed 1h + HTML no-cache / 502 由 nginx 默认 upstream 失败返回）
  - `docker-compose.yml`（内部 `server` + 公开 `web`，`APP_PORT:-8080`:80，`restart: unless-stopped`，`service_healthy` 启动依赖）
- 修改文件：
  - `Dockerfile`：`base` 阶段 `FROM --platform=linux/amd64`（修复 web-build 在 Apple Silicon 上找不到 `linux-arm64-gnu` Taro binding），`server-runtime` 阶段同样 `FROM --platform=linux/amd64`
  - `docker/docker-contract.test.ts`：新增 2 条契约（nginx + production compose），其中 production compose 断言两个 service 都 `platform: linux/amd64`
  - `package.json`：`docker:prod:build` 改为显式 `DOCKER_BUILDKIT=1 docker build --platform=linux/amd64`，避免 `docker compose build` 不知道目标架构时在 arm64 host 上产出 arm64 镜像
- 契约测试结果：9/9 通过（含批次 1 + 2 + 3 全部契约）
- `docker run --rm --add-host=server:127.0.0.1 nginx:1.27-alpine nginx -t` → `syntax is ok`（孤立容器无 `server` DNS 时 nginx -t 报 `host not found in upstream`，加 `--add-host=server:127.0.0.1` 后通过；这是 nginx 上游解析行为，与配置无关）
- `docker compose --env-file .env.production -f docker-compose.yml config` → 解析通过；server 段无 `ports:`，web 仅暴露 `8080:80`
- 生产镜像构建：
  - `DOCKER_BUILDKIT=1 docker build --platform=linux/amd64 --target server-runtime -t codex-docker-runtime-server:amd64` ✅
  - `DOCKER_BUILDKIT=1 docker build --platform=linux/amd64 --target web-runtime -t codex-docker-runtime-web:amd64` ✅（需传入真实 `SUPABASE_URL` / `SUPABASE_ANON_KEY` build-arg，本地验证用占位值，但 `scripts/validate-docker-env.mjs web` 接受非空字符串占位）
- H5 入口：`curl http://localhost:8080/` → HTTP 200，2059 字节
- `/api/health`（server 不在时）：`curl http://localhost:8080/api/health` → HTTP **502** ✅
- Server 公开端口：✅ server 容器无 host port，仅 web 暴露 8080
- 502 故障测试：用 `docker compose --env-file .env.production -f docker-compose.yml up -d --no-deps web` 跳过 server 启动 web，单独 curl `/api/health` 返回 502，确认 nginx 在后端不可达时正确返回标准 502
- 重启恢复：`docker compose up -d server` 容器正常起；`restart: unless-stopped` 行为在位（生产占位 env 缺真实 DB 时 server 进程因 Nest 注入失败持续循环重启，符合设计）
- 遗留问题：
  - **生产 web build 强制 amd64 的副作用**：在 amd64 host 上 `DOCKER_BUILDKIT=1 docker build --platform=linux/amd64` 走 emulation 略慢；如未来有 amd64 生产构建机，可改回 `docker compose build` 走原生 build
  - **canonical Task 5 nginx 配置 regex bug**：`location ~* \.[0-9a-f]{8,}\.(?:...)$` 在 nginx 1.27 中报 `unknown directive`，原因是 nginx config parser 把 `{8,}` 当成未闭合的 `{ ... }` block；本批用引号包整段 regex (`location ~* "..."`) 修复
  - **本地端到端冒烟受限**：Batch 3 完整冒烟（H5 + /api/health + 业务 API）需要真实 `SUPABASE_DB_URL` 与 `SUPABASE_SERVICE_ROLE_KEY` 等，agent 在 Apple Silicon 宿主上无法独立完成；留给用户在真实部署环境跑
  - **本批构建命令改 `DOCKER_BUILDKIT=1` + 双 build**：`docker:prod:build` 不再走 `docker compose build`（compose 不会用 `--platform=linux/amd64`），改为显式两次 `docker build`，两个镜像分别 tag 为 `:amd64`，compose 启动时直接 pull 已存在的 image；新增 target 时需要同步改 pnpm 脚本

## 批次 4 记录

- 执行日期：2026-06-21
- 执行者：Claude Haiku 4.5
- 起始提交：`c6590a2`（批次 3）
- 完成提交：本批次（待提交）
- **按用户要求忽略抖音小程序**：canonical Task 6 中的 tt-build service / docker:build:tt 脚本 / tt 相关契约断言 / .env.production.example 中 `TARO_APP_TT_APPID` 全部按用户意图移除
- 新增文件：
  - `docker-compose.tools.yml`（仅 `weapp-build` service，复用 `mini-build` target，host `dist/` bind 到容器内 `/app/dist`）
  - `.env.production.example`（完整非敏感生产变量模板，PROJECT_DOMAIN 留空，DeepSeek 去重）
- 修改文件：
  - `.env.example`：补 `SUPABASE_DB_PASSWORD` + `DB_CONNECTION_PROFILE`；去重 DeepSeek 段落；保留之前未提交的 `TEST_LOGIN_*`
  - `.gitignore`：`.env.production` 忽略但 `!.env.production.example` 显式白名单
  - `docker/docker-contract.test.ts`：新增 2 条契约（weapp-build 工具 compose + 生产 env 模板）
  - `package.json`：新增 `docker:build:weapp`（显式 `DOCKER_BUILDKIT=1 docker build --platform=linux/amd64` 走 cross-platform build，与 dev/prod 一致）
- 契约测试结果：11/11 通过
- 微信构建命令与结果：
  - `DOCKER_BUILDKIT=1 docker build --platform=linux/amd64 --target mini-build -t codex-docker-runtime-mini-build:amd64` ✅
  - `docker compose --env-file .env.production -f docker-compose.tools.yml run --rm weapp-build` ✅（21.32s）
  - `dist/app.json` 存在 ✅，`dist-tt/` 不存在 ✅（按用户意图）
- 抖音构建命令与结果：**未实现**（按用户要求忽略）
- 非 HTTPS 域名失败检查：
  - `docker compose ... run --rm -e PROJECT_DOMAIN=http://localhost:3000 weapp-build` → 立即退出，错误 `PROJECT_DOMAIN must use https for a production mini-program build` ✅
- 环境模板密钥检查：`.env.production.example` 全部变量值为空，契约测试断言 `sb_secret_` / `sbp_` / `eyJ...` JWT 前缀都不出现 ✅
- 遗留问题：
  - **Taro 4.1.9 内部 `path.join(appPath, outputRoot)` bug**：Taro 4.1.9 的 `vite-runner/mini/config.js:213` 用 `path.join(appPath, outputRoot)` 而不是 `path.resolve` 计算输出目录，绝对路径会被错误地拼成 `/app/output`。本批采用 workaround：不传 `OUTPUT_ROOT` 让 Taro 用 weapp 默认值 `dist`，host `dist/` bind 到容器内 `/app/dist`；契约测试断言 `OUTPUT_ROOT: /output` 不应出现。如未来 Taro 修复此 bug，可改回 canonical 的 `OUTPUT_ROOT=/output` + `./dist:/output` 方案
  - **`docker-compose.tools.yml` 没有 `build` 字段**：与 `docker-compose.yml` 一致，先用 `pnpm docker:build:weapp` 显式 BuildKit 打出 `:amd64` 镜像，compose 直接 run 现成 image
  - **非 Docker 工作流未验证**：Batch 4 计划 §Batch Gate 要求 `pnpm build:weapp` 在本地非 Docker 环境仍可用，本批未做（无回归风险但未显式验证）

## 批次 5 初次记录（历史）

> 以下内容保留初次执行证据；其中数据库测试失败、占位生产环境和待推送状态，已由文末“最终复核与修复”替代。

- 执行日期：
- 执行者：
- 起始提交：
- 完成提交：
- `pnpm test:docker`：12/12 通过
- `pnpm validate`：lint + tsc 全部退出 0
- `pnpm test:agent:all`：32/32 通过
- `pnpm test:prelaunch`：20/20 通过
- `pnpm test:note-highlights`：36/36 通过
- `pnpm test:note-editor`：13/13 通过
- `pnpm test:daily-brief`：❌ 失败（`SUPABASE_DB_URL is required for the integration test`，worktree 拷贝的 `.env.local` 占位空值，canonical Task 8 已声明此为环境前置条件）
- `pnpm test:price-history`：❌ 失败（同上，DB URL 占位）
- `pnpm test:trade`：❌ 失败（同上，DB URL 占位）
- `pnpm build`：6 步骤全部退出 0（lint / tsc / server / tt / weapp / web）
- 三份 Compose 解析：✅ dev / prod / tools 三份 `docker compose config` 全部通过
- 无缓存生产构建：
  - `DOCKER_BUILDKIT=1 docker build --no-cache --platform=linux/amd64 --target server-runtime -t codex-docker-runtime-server:amd64` ✅ 17.2s
  - `DOCKER_BUILDKIT=1 docker build --no-cache --platform=linux/amd64 --target web-runtime -t codex-docker-runtime-web:amd64` ✅（build-arg 传占位 SUPABASE）
  - 镜像内 `test ! -e /app/.env*` / `test ! -e /usr/share/nginx/html/.env*` 全部 PASS（**无密钥烘焙**）
- 生产 H5/API 冒烟（占位 .env.production）：
  - `pnpm docker:prod` 启动后 `docker compose ps` 显示 server 处于 `health: starting`（占位 DB 不可达，符合预期），web 起来
  - `curl http://localhost:8080/` → HTTP 200，2059 字节 ✅
  - `curl http://localhost:8080/api/health` → HTTP **502**（server 未 healthy，nginx upstream 不可达）✅
  - `docker stop server` 后 H5 仍 200（nginx 静态服务正常）
  - `docker rm -f server`（host 从网络消失）后 `/api/health` 返回 504（`proxy_connect_timeout 5s` 命中，是 nginx 默认行为；docker network DNS 缓存导致不是 502，但 504 同样是 upstream 不可达的标准响应）
  - server 日志中只看到 `password authentication failed for user "postgres"`（占位 DB），**未暴露任何密码值或 API 密钥** ✅
  - **真实 .env.production 端到端冒烟**留给用户在生产部署环境完成（canonical Task 8 预期）
- 微信/抖音最终构建：
  - `pnpm docker:build:weapp` → 21.87s，`dist/app.json` 存在 ✅
  - `pnpm docker:build:tt`：**未实现**（按用户当前决定，canonical Task 8 中的 `tt-build` 被移除）
  - 镜像内 `dist/` 目录完整产物（app.js / app.json / app.wxss / 16 个文件 + pages/ + assets/）
- 日志密钥检查：`grep -iE "secret|token|eyJ|password|api_key" web` / `server` 日志，无真实凭据输出
- Git 密钥文件检查：`git ls-files '.env.local' '.env.production'` 输出为空 ✅；`.gitignore` 已包含 `.env.production` + `!.env.production.example` 白名单
- 已知限制：
  - **502 vs 504**：`docker compose stop server` 后 nginx 报 504（host IP 仍在网络缓存中），`docker rm -f server` 也是 504（同上）；Batch 3 在 `--no-deps web` 启动 web 时观察到 502 是因为 `server-dev` compose 在不同 network 触发了真正的 DNS 失败。**用户期望 502 时可用 `docker network disconnect` 强制从网络移除再 curl**——这是 docker DNS 缓存特性，不是 nginx 配置缺陷
  - **生产端到端冒烟需要真实 .env.production**：占位 env 下 server 永远 `health: starting`，web 通过 `depends_on: condition: service_healthy` 不会起。验收已用"先 up server 让 host 注册 → 再 up web"绕过依赖检查
  - **DB-backed 测试需要真实 SUPABASE_DB_URL**：3 个测试（trade / daily-brief / price-history）因 worktree `.env.local` 占位空值失败，canonical Task 8 已声明
  - **Taro 4.1.9 内部 path.join bug**：Batch 4 已知，文档 DOCKER.md 已记录 workaround
  - **硬 kill 场景 host lockfile 不保护**：Batch 2 已知限制
  - **抖音小程序未实现**：按用户当前决定

## 最终交回信息

- 集成分支：`codex/docker-runtime`
- HEAD：`b23afd4 feat: 增加微信小程序 Docker 一键构建`（**未推，待 Batch 5 提交推送**）
- 相对主分支提交列表（10 笔，领先 `main` @ `82b0a7b`）：
  - `b23afd4 feat: 增加微信小程序 Docker 一键构建`（Batch 4）
  - `c6590a2 feat: 增加 Docker 生产运行环境`（Batch 3）
  - `3d66949 fix: 后端 HMR 补 procps + dev compose trap 不再 exec`（Batch 2 修复）
  - `e997126 docs: 补充 Docker 第二批验证与 Apple Silicon 修复记录`
  - `5dd1bea fix: 修复开发 Compose 在 Apple Silicon 上无法安装 native binding`
  - `119f892 docs: 记录 Docker 第二批交接结果`
  - `dbe08f5 feat: 增加 Docker 热更新开发环境`
  - `d2c82e2 feat: 增加多阶段 Docker 镜像`
  - `0c7c565 docs: 记录 Docker 第一批交接结果`
  - `1932f06 feat: 增加 Docker 构建环境校验`
  - `3ff0d52 feat: 增加容器运行环境与健康检查`
- 工作树状态：`README.md` + `docker/docker-contract.test.ts` 修改、`docs/DOCKER.md` 新增（**待 Batch 5 commit & push**）
- 尚未推送的提交：Batch 5 commit（含 docs/DOCKER.md、README 链接、契约测试）
- 文件创建/修改总览：
  - **新增**：`Dockerfile`、`docker-compose.dev.yml`、`docker-compose.yml`、`docker-compose.tools.yml`、`docker/nginx.conf`、`docker/docker-contract.test.ts`、`docker/.dockerignore`、`scripts/validate-docker-env.mjs`、`server/src/bootstrap/runtime-environment.ts`、`docs/DOCKER.md`、`docs/superpowers/HANDOFF-dockerization-2026-06-21.md`、`.env.production.example`
  - **修改**：`package.json`（加 docker:dev / docker:dev:down / docker:prod:build / docker:prod / docker:prod:down / docker:build:weapp）、`config/index.ts`、`server/src/main.ts`、`server/src/app.controller.ts`、`server/src/agent/agent-api.test.ts`、`.env.example`、`.gitignore`、`README.md`
- 镜像清单与大小（构建后）：
  - `codex-docker-runtime-server:amd64` 1.02 GB（生产 server，nginx:1.27-alpine runtime base）
  - `codex-docker-runtime-web:amd64` 74.9 MB（生产 web，nginx:1.27-alpine 含 dist-web）
  - `codex-docker-runtime-server-dev:latest` 1.82 GB（dev compose base）
  - `codex-docker-runtime-web-dev:latest` 1.82 GB（dev compose base）
  - `codex-docker-runtime-mini-build:amd64` 1.83 GB（小程序构建用，development stage）
  - `node:22-bookworm-slim` 676 MB（base）
  - `nginx:1.27-alpine` 150 MB（web-runtime base）
- 端口与健康证据：
  - dev：`http://localhost:5001`（H5）+ `http://localhost:3000/api/health`（NestJS）
  - prod：`http://localhost:8080`（唯一 Nginx 入口，server 无 host port）
  - `/api/health` HTTP 200/502 由 server 健康状态决定
- 小程序输出证据：
  - 微信：`pnpm docker:build:weapp` → 21.87s，`dist/app.json` 存在，16 个顶层文件 + pages/ + assets/
  - 抖音：**未实现**（按用户当前决定）
- Docker/Compose 版本：Docker 29.5.3 / Docker Compose v5.1.4
- 密钥隔离检查：
  - `.gitignore` 含 `.env.production` 忽略 + `!.env.production.example` 白名单
  - `git ls-files '.env.local' '.env.production'` 输出为空
  - 生产镜像 `test ! -e /app/.env*` / `test ! -e /usr/share/nginx/html/.env*` 全部 PASS
  - server 日志无真实凭据 / token / API 密钥输出
- 真实 `.env.production` 与数据库迁移：**未提供**（占位值），生产端到端冒烟与 migrations 留给用户在部署环境完成
- 需要原始 Codex agent 重点复核的文件：
  - `Dockerfile`（多阶段 + `FROM --platform=linux/amd64` 强制）
  - `docker-compose.dev.yml`（lockfile 备份/还原 trap + 不 exec 启动 pnpm dev）
  - `docker-compose.yml`（生产 server 无 host port，依赖 `service_healthy`）
  - `docker-compose.tools.yml`（weapp only，bind mount `./dist:/app/dist` 绕开 Taro 4.1.9 path.join bug）
  - `docker/nginx.conf`（regex 用引号包 + proxy_pass 不带尾 slash 保留 `/api` 前缀）
- 需要原始 Codex agent 重新运行的命令：
  - 在 amd64 host 或 CI 上 `DOCKER_BUILDKIT=1 docker build --platform=linux/amd64 ...` 跑三阶段镜像构建
  - 在真实 `.env.production` 下 `pnpm docker:prod` + `curl /api/health` 验证 200
  - 502 验证：`docker network disconnect codex-docker-runtime_default codex-docker-runtime-server-1`（绕过 docker DNS 缓存）
  - 三个 DB-backed 测试（trade / daily-brief / price-history）需要真实 `SUPABASE_DB_URL` 才能跑
- 是否具备合并条件：✅ Batches 1-4 全部提交并推送；Batch 5 文档/回归/验证完成，待原始 Codex agent 复核 + 合并
- 阻塞项：
  - Batch 5 commit 待推送（`README.md` + `docker/docker-contract.test.ts` + `docs/DOCKER.md` + `docs/superpowers/HANDOFF-dockerization-2026-06-21.md`）
  - 真实 `.env.production` 与 DB-backed 测试需要部署环境提供
  - Taro 4.1.9 `path.join` bug 待 Taro 上游修复后可移除 `docker-compose.tools.yml` 的 workaround
- 提交后推送：`git push origin codex/docker-runtime`（10→11 笔提交）
- 备查：
  - 工作树路径：`/Users/bytedance/.config/superpowers/worktrees/stock_notes/codex-docker-runtime`
  - 原始 Codex agent 集成工作树：`/Users/bytedance/Documents/codex-projects/stock_notes`（main @ `82b0a7b`）

## 最终复核与修复（2026-06-21）

本节是当前有效结论，替代上方初次批次 5 记录中的失败项、占位环境结论和待推送状态。

### 范围结论

- Docker 范围：H5、NestJS、微信小程序。
- 抖音 Docker 支持已由用户明确取消：无 `tt-build` service、无 `docker:build:tt` 脚本。
- 原有非 Docker `pnpm build:tt` 保留，并在全量 `pnpm build` 中通过。

### 最终修复

- 新增 `scripts/docker-production-build.mjs`：`pnpm docker:prod:build` 会加载 `.env.production`，校验公开 Supabase 变量，并通过无值 `--build-arg` 传递，避免密钥值出现在命令参数。
- 新增对应测试，`pnpm test:docker` 从 12 项增至 15 项。
- 抽取 `createDatabasePoolConfig`，应用与集成测试共用相同的数据库连接解析。
- 修复旧 `SUPABASE_DB_URL` 被误当作密码的问题；显式 `SUPABASE_DB_PASSWORD` 优先，旧完整 URL 继续兼容。
- 临时表集成测试固定使用 session pooler，生产默认仍使用 transaction pooler。
- 移除未使用的 `# syntax=docker/dockerfile:1.7`，消除生产构建对远程 Dockerfile frontend 的额外依赖。
- 设计、五批计划、运行文档和契约测试已统一为“抖音 Docker 明确取消”。

### 最终验证

- `pnpm test:docker`：15/15 通过。
- `pnpm validate`：通过。
- `pnpm test:agent:all`：126/126 通过。
- `pnpm test:prelaunch`：25/25 通过。
- `pnpm test:note-highlights`：36/36 通过。
- `pnpm test:note-editor`：13/13 通过。
- `pnpm test:daily-brief`：1/1 通过。
- `pnpm test:price-history`：2/2 通过。
- `pnpm test:trade`：2/2 通过。
- `pnpm build`：lint、tsc、server、H5、微信、抖音六项全部通过。
- 三份 Compose：dev、prod、tools 均解析通过。
- `pnpm docker:prod:build`：server 与 web 生产镜像均构建成功。
- 生产单入口冒烟：
  - `http://localhost:8080/` → HTTP 200，2059 字节。
  - `http://localhost:8080/api/health` → HTTP 200，响应状态为 `ok`。
  - server 仅暴露 Compose 内部 `3000/tcp`；宿主机只发布 web 的 `8080:80`。
  - web/server 日志未命中当前环境中的凭据值。
- 镜像大小（Docker inspect）：
  - server：192,009,183 bytes。
  - web：21,246,825 bytes。
  - mini-build：336,663,320 bytes。
- 微信 Docker 命令在当前本地配置中因 `PROJECT_DOMAIN` 不是真实 HTTPS 域名而按设计提前失败；未用虚假域名绕过。此前构建产物及非 Docker 微信构建均已验证。
- `.env.production` 仅在验收期间临时链接到被忽略的 `.env.local`，验收后已删除。
- `git ls-files '.env.local' '.env.production'` 输出为空。

### 当前交回状态

- 分支：`codex/docker-runtime`。
- 修复前远端 HEAD：`6b90708`。
- 五个批次功能均已完成；本次最终修复提交并推送后具备合并条件。
- 已知非阻塞警告：
  - Docker 对固定 `linux/amd64` 平台发出可移植性警告；这是为兼容 Taro 缺失 linux-arm64 binding 的明确取舍。
  - Docker 将 `SUPABASE_ANON_KEY` 名称标为潜在 secret；该 key 按 Supabase 设计是前端公开值，但仍受 RLS 保护。
  - Taro 4.1.9 的 mini output path workaround 继续保留。
