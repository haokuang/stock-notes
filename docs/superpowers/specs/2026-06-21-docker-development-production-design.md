# Docker 开发与生产运行设计

## 1. 背景与目标

当前项目由以下部分组成：

- Taro + React 前端，可构建 H5、微信小程序和抖音小程序。
- NestJS 后端，统一使用 `/api` 路由前缀。
- 外部 Supabase，承担认证、Postgres、Realtime 等能力。
- 外部 TOS、模型提供商和 Tavily 等服务。

本次 Docker 化同时服务本地开发和生产部署，并保留现有非 Docker 工作流。目标如下：

1. 本地通过一条命令启动 H5 与 NestJS，并支持前后端热更新。
2. 生产通过单一公网入口提供 H5 和 `/api`。
3. 微信、抖音小程序可在 Docker 中一键构建，并把产物输出到宿主机。
4. Supabase、TOS、模型服务等继续使用外部云服务，不在 Compose 内自建。
5. 密钥不写入镜像或仓库。
6. 原有 `pnpm dev`、`pnpm build` 及单端构建方式继续可用。

## 2. 范围

### 2.1 本期包含

- H5 开发容器和生产镜像。
- NestJS 开发容器和生产镜像。
- 开发、生产两套 Docker Compose 配置。
- Nginx 静态服务与 `/api` 反向代理。
- 微信、抖音小程序一次性构建任务。
- 健康检查、自动重启、日志输出和操作文档。
- Docker 相关脚本及环境变量模板。

### 2.2 本期不包含

- Supabase 本地化或私有化部署。
- 微信、抖音小程序自动上传或发布。
- HTTPS 证书申请与续期。
- Kubernetes、Swarm 或多节点编排。
- 独立日志平台、指标平台或链路追踪系统。
- 数据库迁移自动执行；迁移仍沿用项目现有发布流程。

## 3. 方案选择

采用“多阶段镜像 + 开发/生产两套 Compose”的方案。

未采用的方案：

- NestJS 同时托管 H5：文件较少，但前后端运行职责耦合，静态资源能力与后续扩展较弱。
- 开发和生产共用全功能大镜像：维护入口较少，但生产镜像包含不必要的编译工具和依赖。

选定方案将构建过程与运行过程分离，使生产镜像更小，并让 H5、API、小程序构建各自保持清晰边界。

## 4. 总体架构

### 4.1 本地开发

`docker-compose.dev.yml` 包含：

- `web-dev`
  - 使用 Node + pnpm。
  - 执行 Taro H5 watch 构建和开发服务。
  - 对宿主机暴露 `5001`。
  - 挂载项目源代码。
  - 使用独立依赖 volume，避免宿主机目录覆盖容器中的依赖。
  - 在 Docker Desktop/macOS 环境启用轮询文件监听。

- `server-dev`
  - 使用 Node + pnpm。
  - 执行 NestJS watch 模式。
  - 对宿主机暴露 `3000`。
  - 挂载项目源代码并复用独立依赖 volume。
  - 读取 `.env.local` 中的开发配置。

开发时访问：

- H5：`http://localhost:5001`
- API：`http://localhost:3000/api`

H5 仍使用现有 `/api` 相对路径和开发代理，不在业务代码中硬编码容器域名。

### 4.2 生产运行

`docker-compose.yml` 包含：

- `web`
  - 构建阶段使用 Node + pnpm 生成 `dist-web`。
  - 运行阶段使用 Nginx 提供静态文件。
  - 作为唯一公网入口。
  - 将 `/api/*` 转发到内部服务 `server:3000`。

- `server`
  - 构建阶段安装依赖并编译 NestJS。
  - 运行阶段只包含生产运行所需文件和依赖。
  - 仅加入 Compose 内部网络，不直接暴露公网端口。
  - 通过标准输出和标准错误输出日志。

生产请求流：

1. 浏览器或客户端访问统一域名。
2. H5 静态请求由 Nginx 返回。
3. `/api/*` 请求由 Nginx 转发至 NestJS。
4. NestJS 访问外部 Supabase、TOS、模型提供商和 Tavily。

### 4.3 小程序构建

小程序构建使用一次性 Compose 服务或 Docker 构建目标，不作为常驻服务：

- 微信小程序执行 `pnpm build:weapp`，输出到宿主机 `dist/`。
- 抖音小程序执行 `pnpm build:tt`，输出到宿主机 `dist-tt/`。
- 构建成功后容器退出并返回状态码 `0`。
- 构建失败时返回非零状态码。
- 构建过程使用 pnpm，不引入 npm 或 yarn。
- 发布、审核和上线仍由用户在对应开发者工具中人工确认。

H5、微信小程序和抖音小程序可以同时使用同一套生产 NestJS API 和云端 Supabase。

## 5. 镜像与文件设计

计划新增或调整：

- `Dockerfile`
  - 提供依赖、开发、H5 构建、后端构建、后端运行和小程序构建等目标。
- `docker-compose.yml`
  - 生产编排。
- `docker-compose.dev.yml`
  - 本地开发编排。
- `docker/nginx.conf`
  - H5 静态服务与 `/api` 反向代理。
- `.dockerignore`
  - 排除密钥、依赖、构建产物、Git 数据和本地工具目录。
- `.env.production.example`
  - 仅包含变量名、说明和无敏感默认值。
- `package.json`
  - 增加统一 Docker 操作脚本。
- `server/src/main.ts`
  - 兼容容器注入环境变量，并保留本地 `.env.local` 回退。
- 后端健康检查相关 Controller 或现有 Controller。
- `README.md` 或独立 Docker 运行文档。

镜像构建使用仓库锁文件和 pnpm frozen lockfile，确保依赖可重复安装。

## 6. 环境变量与安全

### 6.1 开发环境

- Compose 通过 `.env.local` 向开发容器注入变量。
- `.env.local` 保持 Git 忽略。
- 本地非 Docker 启动仍可读取 `.env.local`。

### 6.2 生产环境

- 生产服务器创建 `.env.production`，不提交仓库。
- Compose 通过 `env_file` 将生产变量注入后端。
- H5 构建阶段只接收允许公开的配置：
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - 必要的小程序公开标识
- 以下变量只能进入后端运行环境，不进入 H5 bundle：
  - `SUPABASE_SERVICE_ROLE_KEY`
  - 数据库密码或连接信息
  - TOS 访问密钥
  - DeepSeek、OpenAI、MiniMax、Tavily 等 API Key
  - Resend 等告警密钥

### 6.3 同域请求

生产 H5 使用 `/api` 相对路径，`PROJECT_DOMAIN` 为空。Nginx 负责路由到 NestJS，避免额外跨域配置。

小程序不通过 Nginx 内部服务名访问 API；其生产构建应注入真实 HTTPS 公网域名作为 `PROJECT_DOMAIN`。该域名必须满足对应小程序平台的合法域名要求。

### 6.4 环境加载优先级

后端采用以下顺序：

1. 已由容器或进程注入的环境变量。
2. 本地开发时缺失变量再从仓库根目录 `.env.local` 加载。

加载 `.env.local` 时不得覆盖已经注入的生产变量。

### 6.5 构建上下文

`.dockerignore` 至少排除：

- `.env.local`
- `.env.production`
- 其他包含真实密钥的 `.env*`
- `node_modules`
- `server/node_modules`
- `dist`、`dist-web`、`dist-tt`、`server/dist`
- `.git`
- 本地编辑器和工具缓存
- 测试报告、日志和临时文件

环境变量示例文件需通过白名单重新包含或使用明确文件名，避免模板被一并排除。

## 7. Nginx 行为

Nginx 配置承担：

- 提供 `dist-web` 静态文件。
- 正确返回 H5 入口文件。
- 转发 `/api/*`，并保持 `/api` 路径不被重复添加或删除。
- 传递客户端地址、Host 和代理协议信息。
- 为带内容哈希的静态资源设置长期缓存。
- 对 HTML 使用较短或不缓存策略，避免发布后继续加载旧资源。
- 启用 gzip 等基础压缩。
- 设置与 NestJS 请求体限制一致或更高的上传大小上限。
- 后端不可用时返回标准 `502`，不伪装成成功响应。

当前 H5 使用 Hash Router，不需要服务器端为任意页面路径做复杂路由回退；仍保留对入口文件的稳健回退配置。

## 8. 健康检查与生命周期

后端增加 `GET /api/health`：

- 正常返回 HTTP 200。
- 响应只包含应用状态、版本或时间等非敏感信息。
- 不返回环境变量、密钥或数据库连接详情。
- 第一版只验证 NestJS 进程可响应和基础配置已加载，不将第三方模型暂时不可用视为容器死亡。

生产 Compose：

- `server` 配置健康检查。
- `web` 等待 `server` 达到健康状态后再被视为完整可用。
- 常驻服务使用合适的自动重启策略。
- 进程响应终止信号并利用 NestJS 现有 shutdown hooks 优雅退出。

开发 Compose：

- 不因代码编译中的短暂错误反复重启整个开发栈。
- 热更新进程直接输出编译错误，修复代码后自动恢复。

## 9. 操作接口

项目根目录提供以下 pnpm 脚本：

```bash
pnpm docker:dev
pnpm docker:dev:down

pnpm docker:prod:build
pnpm docker:prod
pnpm docker:prod:down

pnpm docker:build:weapp
pnpm docker:build:tt
```

语义：

- `docker:dev`：启动或重建本地热更新服务。
- `docker:dev:down`：停止开发服务，默认保留依赖缓存 volume。
- `docker:prod:build`：构建生产 H5 与后端镜像。
- `docker:prod`：启动生产编排。
- `docker:prod:down`：停止生产编排。
- `docker:build:weapp`：一次性构建微信小程序并输出产物。
- `docker:build:tt`：一次性构建抖音小程序并输出产物。

文档同时给出查看日志、检查健康状态、强制重建和清理依赖 volume 的命令，但不把破坏性清理加入默认流程。

## 10. 错误处理

- 缺少生产必需环境变量时，后端应尽早失败并输出变量名，不输出变量值。
- 生产 H5 构建缺少 `SUPABASE_URL` 或 `SUPABASE_ANON_KEY` 时必须失败；开发构建继续兼容现有空值行为，便于运行不依赖登录的页面和静态检查。
- 生产小程序构建缺少 `PROJECT_DOMAIN` 时必须失败，避免生成无法访问后端的发布产物；本地调试构建可由开发者显式传入测试域名。
- Nginx 无法连接后端时返回 `502`。
- 小程序构建失败时保留完整错误日志并返回非零退出码。
- Docker 脚本直接透传 Compose 状态码，便于本地和 CI 判断成功或失败。
- 不在容器启动阶段自动修改生产数据库。

## 11. 测试与验收

### 11.1 静态验证

- Docker Compose 配置可成功解析。
- 所有镜像可构建。
- 镜像历史和最终文件系统不包含 `.env.local` 或生产密钥文件。
- Nginx 配置检查通过。

### 11.2 开发环境

1. 执行 `pnpm docker:dev`。
2. `http://localhost:5001` 可打开 H5。
3. 登录和普通 API 请求正常。
4. 修改前端文件后 H5 自动重建或刷新。
5. 修改后端文件后 NestJS 自动重启。
6. 停止并再次启动时无需重新手工安装依赖。

### 11.3 生产环境

1. 执行 `pnpm docker:prod:build`。
2. 执行 `pnpm docker:prod`。
3. 只通过 Nginx 暴露的单一入口访问 H5。
4. 同一入口下的 `/api/health` 和业务 API 正常。
5. NestJS 不直接暴露公网端口。
6. 重启容器后应用自动恢复。
7. HTML 与带哈希静态资源的缓存策略符合设计。

### 11.4 小程序

1. `pnpm docker:build:weapp` 成功向 `dist/` 输出可导入微信开发者工具的产物。
2. `pnpm docker:build:tt` 成功向 `dist-tt/` 输出可导入抖音开发者工具的产物。
3. 两种构建失败时均返回非零状态码。
4. 构建不覆盖另一个平台的输出目录。

### 11.5 回归

- `pnpm validate` 通过。
- `pnpm build` 通过。
- 项目现有相关测试通过。
- 非 Docker 的 `pnpm dev`、`pnpm build:web`、`pnpm build:weapp` 和 `pnpm build:tt` 保持可用。

## 12. 文档要求

运行文档应包含：

- Docker 与 Docker Compose 版本要求。
- 首次开发启动步骤。
- 生产环境变量准备与启动步骤。
- 单域名反向代理说明。
- 小程序公网 API 域名配置说明。
- 微信、抖音小程序构建及导入开发者工具步骤。
- 日志、健康检查、重建和停止命令。
- 端口占用、文件监听、依赖缓存、代理 `502` 和环境变量缺失等常见故障排查。

## 13. 完成定义

只有在以下条件全部满足时，本次 Docker 化才算完成：

- 开发与生产 Compose 均可实际运行。
- H5 与 NestJS 通过生产单一入口协同工作。
- 开发热更新在 macOS Docker 环境可用。
- 微信和抖音小程序能在 Docker 中一键构建。
- 密钥未进入仓库、镜像层或前端 bundle。
- 健康检查能够区分正常服务与不可用服务。
- 原有非 Docker 工作流未被破坏。
- 全量构建、测试和文档验收通过。
