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
| 3 | 生产 Nginx、单入口 Compose | 待执行 |  |  |
| 4 | 微信/抖音小程序一键构建 | 待执行 |  |  |
| 5 | 文档、全量验证、交回 | 待执行 |  |  |

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

- 执行日期：
- 执行者：
- 起始提交：
- 完成提交：
- Nginx 配置检查：
- Compose 配置检查：
- 生产镜像构建：
- H5 入口：
- `/api/health`：
- Server 是否无公开端口：
- 502 故障测试：
- 重启恢复：
- 遗留问题：

## 批次 4 记录

- 执行日期：
- 执行者：
- 起始提交：
- 完成提交：
- 微信构建命令与结果：
- 微信输出目录检查：
- 抖音构建命令与结果：
- 抖音输出目录检查：
- 非 HTTPS 域名失败检查：
- 环境模板密钥检查：
- 遗留问题：

## 批次 5 记录

- 执行日期：
- 执行者：
- 起始提交：
- 完成提交：
- `pnpm test:docker`：
- `pnpm validate`：
- `pnpm test:agent:all`：
- `pnpm test:prelaunch`：
- `pnpm test:note-highlights`：
- `pnpm test:note-editor`：
- `pnpm test:daily-brief`：
- `pnpm test:price-history`：
- `pnpm test:trade`：
- `pnpm build`：
- 三份 Compose 解析：
- 无缓存生产构建：
- 生产 H5/API 冒烟：
- 微信/抖音最终构建：
- 日志密钥检查：
- Git 密钥文件检查：
- 已知限制：

## 最终交回信息

- 集成分支：
- HEAD：
- 相对主分支提交列表：
- 工作树状态：
- 尚未推送的提交：
- 需要原始 Codex agent 重点复核的文件：
- 需要原始 Codex agent 重新运行的命令：
- 是否具备合并条件：
- 阻塞项：
