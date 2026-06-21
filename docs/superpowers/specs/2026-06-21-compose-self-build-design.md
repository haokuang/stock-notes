# Docker Compose 自构建设计

## 目标

让新机器在仅有源码和 `.env.production` 的情况下，通过 `pnpm docker:prod` 自动构建并启动生产镜像，不再依赖当前机器预先存在 `codex-docker-runtime-server:amd64` 与 `codex-docker-runtime-web:amd64`。

## 方案

- `docker-compose.yml` 的 `server` 保留固定 `image` 名称，同时增加 `build`：
  - context 为仓库根目录；
  - Dockerfile 为根目录 `Dockerfile`；
  - target 为 `server-runtime`；
  - build platform 为 `linux/amd64`。
- `web` 同样保留固定 `image` 名称，target 使用 `web-runtime`，并从 `.env.production` 注入公开构建参数 `SUPABASE_URL`、`SUPABASE_ANON_KEY`。
- `pnpm docker:prod` 使用 `docker compose ... up -d --build`，确保新机器首次运行时构建镜像，并在后续运行中复用缓存。
- `pnpm docker:prod:build` 保留，继续支持只预构建、不启动的工作流。

## 兼容性与安全

- 继续固定 `linux/amd64`，规避 Taro 依赖缺少 linux-arm64 binding 的问题。
- 只有前端本就公开的 Supabase URL 与 anon key 进入 web build args；service role、数据库密码、模型密钥等只通过 server `env_file` 在运行时注入。
- 服务端仍不发布宿主机端口；生产环境只暴露 Nginx。
- 不改变 `.env.production` 的忽略规则，不把真实配置写入 Compose 或镜像上下文。

## 文档与验证

- Docker 契约测试新增两个 service 的 build target、platform 和 web build args 断言。
- README 与 `docs/DOCKER.md` 明确：新机器准备 `.env.production` 后可直接运行 `pnpm docker:prod`；`docker:prod:build` 为可选预构建步骤。
- 验证三份 Compose 均可解析，Docker 契约、类型检查与 lint 通过。
