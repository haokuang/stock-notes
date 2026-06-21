# Docker 运行指南

## 前置要求

- Docker Desktop 或 Docker Engine
- Docker Compose v2
- 项目命令统一使用 pnpm
- Apple Silicon 主机:Taro 4.1.9 / @swc.core 1.3.96 / @tarojs/plugin-doctor 不发布 `linux-arm64-gnu` binding。所有 dev/prod compose 与生产 build 阶段均已强制 `platform: linux/amd64`,在 Apple Silicon 上使用 BuildKit 跨平台 build:

```bash
DOCKER_BUILDKIT=1 docker build --platform=linux/amd64 --target <stage> -t <name> .
```

确认环境:

```bash
docker --version
docker compose version
pnpm --version
```

## 本地开发

准备根目录 `.env.local`,然后启动:

```bash
pnpm docker:dev
```

- H5:`http://localhost:5001`
- API 健康检查:`http://localhost:3000/api/health`

前后端源码会挂载进容器。macOS 下已启用轮询监听,保存代码后应自动重建。

后端 `nest start --watch` 在增量编译后会 `spawn ps` 检查进程树,Dockerfile 基础镜像已安装 `procps`。但**软重启场景**(`/api/health` 在 server 不可达时由 nginx 返回 502)。

停止服务但保留依赖缓存:

```bash
pnpm docker:dev:down
```

容器启动时使用 `pnpm install --no-frozen-lockfile` 重新生成 lockfile,以补全当前架构的 native binding。`pnpm dev:server` / `pnpm dev:web` 作为 shell 子进程启动(不 `exec`),`trap EXIT/INT/TERM/HUP` 在容器退出时把宿主机原始 `pnpm-lock.yaml` 还原回 bind mount。**已知限制**:`docker kill -9` / 宿主机断电等硬 kill 场景 trap 不会执行,host lockfile 不会被还原。

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

`docker:prod:build` 显式用 `DOCKER_BUILDKIT=1 docker build --platform=linux/amd64` 两次构建出 `codex-docker-runtime-server:amd64` 与 `codex-docker-runtime-web:amd64`,`docker:prod` 直接 run 已有 image。

访问:

```bash
curl http://localhost:8080/
curl http://localhost:8080/api/health
```

停止:

```bash
pnpm docker:prod:down
```

## 单域名与 HTTPS 网关

生产容器只公开 Nginx (port 80 in container, 映射到 `APP_PORT`)。H5 使用同域 `/api`,Nginx 将其转发至内部 NestJS 服务。

本项目第一版不管理 TLS 证书。请让服务器现有网关或云负载均衡终止 HTTPS,再转发到 `APP_PORT`。

## 微信小程序构建

先在 `.env.production` 填入已在微信平台登记的 HTTPS `PROJECT_DOMAIN`:

```bash
pnpm docker:build:weapp
```

产物写入 `dist/`,可导入微信开发者工具。该命令不自动上传或发布。

Taro 4.1.9 内部 `vite-runner/mini/config.js` 用 `path.join(appPath, outputRoot)` 计算输出目录,绝对路径会被错误拼成 `/app/output`。`docker-compose.tools.yml` 不传 `OUTPUT_ROOT`,让 Taro 用 weapp 默认值 `dist`,host `dist/` bind 到容器内 `/app/dist` 直接拿到产物。

## 日志与健康检查

```bash
docker compose --env-file .env.production -f docker-compose.yml ps
docker compose --env-file .env.production -f docker-compose.yml logs -f web server
curl http://localhost:8080/api/health
```

健康接口只表示 NestJS 可响应和基础配置已加载,不把第三方模型短暂故障当成容器死亡。

## 停止、重建与依赖缓存

生产无缓存重建:

```bash
docker compose --env-file .env.production -f docker-compose.yml build --no-cache
```

如本机已有 `:amd64` tag,直接用 `DOCKER_BUILDKIT=1 docker build --no-cache --platform=linux/amd64 --target <stage> -t <name> .` 重打。

开发依赖 volume 默认保留。只有需要彻底重装依赖时才执行:

```bash
docker compose -f docker-compose.dev.yml down --volumes
```

该命令会删除本项目开发容器的依赖缓存。下次 `pnpm docker:dev` 启动会重新 `pnpm install` 补全当前架构 binding。

## 常见故障

### 端口被占用

检查 `5001`、`3000` 或 `APP_PORT`,停止占用进程或修改生产端口。

### 保存代码后没有重建

确认通过 `docker-compose.dev.yml` 启动,并检查 `CHOKIDAR_USEPOLLING` 和 `WATCHPACK_POLLING` 是否为 `true`。

### Nginx 返回 502

`502` 表示 Nginx 无法连接健康的 NestJS 服务:

```bash
docker compose --env-file .env.production -f docker-compose.yml ps
docker compose --env-file .env.production -f docker-compose.yml logs server
```

### 缺少环境变量

后端会列出缺少的变量名;生产 H5 缺少公开 Supabase 配置会停止构建;小程序缺少 HTTPS `PROJECT_DOMAIN` 也会停止构建。

### 数据库结构缺失

Docker 启动不会自动执行数据库迁移。请先按项目现有 Supabase 发布流程应用 `server/migrations/`。

### 构建产物位置

- H5 位于生产 Nginx 镜像内。
- 微信小程序位于宿主机 `dist/`。
- 抖音小程序:**本项目未实现**(按用户当前决定,canonical 计划里的 `tt-build` service / `pnpm docker:build:tt` 脚本被移除)。
