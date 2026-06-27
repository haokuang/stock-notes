# Supabase 接入指南

本文档记录本项目从 Coze Coding 托管 PG 切换到 Supabase Postgres + Supabase Auth 的完整步骤、环境变量、Schema 和常见问题。

## 1. 为什么迁移

- **Coze Coding** 托管 PG:SDK `coze-coding-dev-sdk` 通过 `PGDATABASE_URL` 访问,无内建用户隔离
- **Supabase**:托管 Postgres(Postgres 17)+ 内建 Auth(邮箱/手机/OAuth)+ Row Level Security(行级权限)+ Storage + Realtime 一站式
- 迁移后所有写操作强制带 `user_id`,RLS 在 DB 层兜底,即使有人拿到 anon key 也只能访问自己的数据

## 2. 架构总览

```
┌──────────────────┐
│  H5 / 小程序     │  Taro + React + Tailwind
│  src/            │  Network.request 自动带 Bearer JWT
└────────┬─────────┘
         │ HTTP (Authorization: Bearer <supabase_jwt>)
         ▼
┌──────────────────┐
│  NestJS Server   │  JwtGuard 全局鉴权 → req.user.id
│  server/         │  stocks / notes / ai / upload / api-auth
└────────┬─────────┘
         │ pg (postgres 角色 + 真 db password,直连 5432)
         ▼
┌──────────────────┐
│  Supabase        │  Postgres 17 (东京或阿里云 RDS Supabase)
│  public schema   │  用户业务表 + RLS + Realtime publication
└──────────────────┘
```

## 3. 一次性配置步骤

### 3.1 创建 Supabase 项目

1. 打开 https://supabase.com/dashboard
2. 新建项目,Region 选 **ap-northeast-1(东京)**
3. 设置一个**强密码**(Database Password),记下来 — 之后连 DB 用

### 3.2 跑 SQL 建表 + RLS

打开 Supabase Dashboard → SQL Editor → New query，按编号顺序执行 `server/migrations/0001_init.sql` 到最新迁移。当前最新为 `0013_wechat_accounts.sql`。

迁移完成后有 5 张按用户隔离的业务表，共 20 条 RLS 策略；另有 `error_logs` 内部监控表及相关索引、触发器。

### 3.3 生成 API 密钥

Supabase Dashboard → Project Settings → API:

| 字段 | 用途 |
|---|---|
| `Project URL` → `SUPABASE_URL` | 后端 + 前端连接 |
| `anon public` key (JWT 或 `sb_publishable_...`) → `SUPABASE_ANON_KEY` | 前端用,受 RLS 约束 |
| `service_role` key (JWT 或 `sb_secret_...`) → `SUPABASE_SERVICE_ROLE_KEY` | 后端用,绕过 RLS |
| `Project API Keys` → Personal Access Token(`sbp_...`)→ `SUPABASE_ACCESS_TOKEN` | 只在跑管理 API / MCP 时用 |

### 3.4 重置 Database Password(若不知道)

Dashboard → Settings → Database → Database password → **Reset database password** → 复制新密码

### 3.5 写 `.env.local`(项目根)

```bash
# Supabase 项目 URL
SUPABASE_URL=https://hgpxchebcipynrfjssiq.supabase.co

# API 密钥(从 Dashboard → Settings → API 复制)
SUPABASE_ANON_KEY=sb_publishable_xxx                # 或 legacy eyJ... JWT
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx             # 或 legacy eyJ... JWT

# DB 直连，优先级 DATABASE_URL > SUPABASE_DB_URL > SUPABASE_DB_PASSWORD
SUPABASE_DB_URL=postgresql://postgres:数据库密码@db.<ref>.supabase.co:5432/postgres

# 可省略，默认 true；若 RDS 返回 “server does not support SSL connections” 则设为 false
DATABASE_SSL=true

# Personal Access Token(从 https://supabase.com/dashboard/account/tokens 生成)
SUPABASE_ACCESS_TOKEN=sbp_xxx

# 兼容旧版(没用可空):Coze 备用库
# PGDATABASE_URL=

# 开发 fallback:无 JWT 时 server 用这个 user_id 写入(可选)
DEFAULT_USER_ID=<uuid>
```

⚠️ `.env.local` 已在 `.gitignore` 里忽略,不会进 git。但**不要**把 `SUPABASE_SERVICE_ROLE_KEY` 泄露到任何前端 bundle 里(它绕过 RLS)。

### 3.6 阿里云 RDS Supabase 切换要点

阿里云 RDS Supabase 与普通 Supabase 项目一样需要三组应用凭据：

```bash
SUPABASE_URL=<阿里云 Supabase 项目 URL>
SUPABASE_ANON_KEY=<阿里云 anon key>
SUPABASE_SERVICE_ROLE_KEY=<阿里云 service role key>
```

数据库连接推荐使用完整连接串，避免旧东京 Supavisor profile 被误用：

```bash
DATABASE_URL=postgresql://postgres:数据库密码@阿里云 RDS 外网或内网地址:5432/supabase_db
# 或继续使用兼容变量:
SUPABASE_DB_URL=postgresql://postgres:数据库密码@阿里云 RDS 外网或内网地址:5432/supabase_db

# 阿里云 RDS 若未启用 SSL，需要显式关闭
DATABASE_SSL=false

# 使用完整连接串时不要再填写旧 profile 密码
SUPABASE_DB_PASSWORD=
DB_CONNECTION_PROFILE=
```

验证 SQL：

```sql
select exists(select 1 from pg_namespace where nspname = 'auth') as has_auth_schema;
select exists(select 1 from pg_proc where proname = 'uid' and pronamespace = 'auth'::regnamespace) as has_auth_uid;
select exists(select 1 from pg_publication where pubname = 'supabase_realtime') as has_supabase_realtime;
```

本项目已验证阿里云 RDS Supabase 需要 `DATABASE_SSL=false` 才能用 `pg` 直连当前外网地址；生产部署在同 VPC 的 ECS 上时优先使用内网地址。

### 3.7 本地保留多套 Supabase 配置并快速切换

项目提供本地 profile 切换脚本，用于在“阿里云 RDS Supabase”和“Supabase 东京项目”之间切换 `.env.local`。profile 文件放在 `.env.profiles/` 下，此目录已被 `.gitignore` 忽略，密钥不会提交到 Git。

```bash
mkdir -p .env.profiles
```

阿里云示例 `.env.profiles/aliyun.env`：

```bash
SUPABASE_URL=<阿里云 Supabase URL>
SUPABASE_ANON_KEY=<阿里云 anon key>
SUPABASE_SERVICE_ROLE_KEY=<阿里云 service role key>
SUPABASE_DB_URL=postgresql://postgres:密码@阿里云 RDS 地址:5432/supabase_db
DATABASE_SSL=false
```

东京示例 `.env.profiles/tokyo.env`：

```bash
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<东京 anon key>
SUPABASE_SERVICE_ROLE_KEY=<东京 service role key>
SUPABASE_DB_URL=postgresql://postgres:密码@db.<project-ref>.supabase.co:5432/postgres
DATABASE_SSL=true
```

切换命令：

```bash
pnpm supabase:switch aliyun
pnpm supabase:switch tokyo
```

脚本只会改 `.env.local` 中 Supabase / 数据库连接相关变量，并清空目标 profile 未声明的同类变量，避免新旧实例配置混用。切换后需要重启后端服务：

```bash
docker compose -f docker-compose.dev.yml restart server-dev
# 或本地 pnpm dev:server 进程重启
```

## 4. Supabase Auth 配置

### 4.1 关闭邮箱确认(开发用)

Dashboard → Authentication → Providers → Email → **Confirm email** 关闭。

或者保持开启(生产推荐),但用户注册后**必须查邮件点击确认链接**才能登录。

### 4.2 JWT 格式

Supabase 签的 JWT 是 ES256(ECDSA-P256),`alg=ES256`,`kid` 存在 JWK 头里。后端用 `@supabase/supabase-js` 的 `client.auth.getUser(jwt)` 验签,**无需自己实现 JWT 解码**。

Token 寿命默认 1 小时。前端在 401 时使用 `refresh_token` 单次续期并重放原请求；并发失败请求共享同一次刷新，刷新成功后也会把新 access token 同步给 Realtime，只有续期失败才清理 session 并跳登录页。

## 5. RLS 策略一览

5 张用户业务表都开启 RLS，20 条策略 = 5 表 × 4 操作(SELECT/INSERT/UPDATE/DELETE)，统一规则:

```sql
CREATE POLICY "tablename_select_own" ON tablename FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "tablename_insert_own" ON tablename FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tablename_update_own" ON tablename FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tablename_delete_own" ON tablename FOR DELETE
  USING (auth.uid() = user_id);
```

**外键约束**：用户业务表的 `user_id` 已引用 `auth.users(id) ON DELETE CASCADE`。`DEFAULT_USER_ID` 仅保留为本地调试 fallback，线上请求仍应全部携带真实用户 JWT。

## 6. 跑起来

```bash
# 1. 装依赖
pnpm install

# 2. 启 dev
pnpm dev                 # 同时启 H5 + server
# 或单独:
pnpm dev:web             # http://localhost:5001(被占用会递增)
pnpm --filter server dev # http://localhost:3000
```

第一次访问:
- H5 打开 `http://localhost:5001/#/pages/login/index`
- 注册一个邮箱(用真实域名,Supabase 会校验)
- 登录后自动跳首页,看自选股 / 观点流

## 7. 验证迁移是否成功

```bash
# Server 启动日志应出现:
# [DatabaseModule] ✓ Database connected (server time: ...)

# 任何未带 token 的 API 应返回 401:
curl -sS http://localhost:3000/api/stocks/summary
# → {"message":"Missing Authorization header","error":"Unauthorized","statusCode":401}

# 注册新用户
curl -sS -X POST http://localhost:3000/api/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{"email":"test@gmail.com","password":"TestPass123"}'
# → {"data":{"user":{"id":"...","email":"test@gmail.com"},"access_token":"eyJ..."}}

# 用 JWT 调接口
JWT="<上面返回的 access_token>"
curl -sS http://localhost:3000/api/stocks/summary -H "Authorization: Bearer $JWT"
# → {"data":{"stocks":0,"notes":0,"reports":0,"bull":0}}
```

## 8. 常见问题

### 8.1 注册返回 `Email address "x@y.com" is invalid`

Supabase Auth 默认对邮箱域名做 MX 校验。用真实可解析的域名(`@gmail.com` / `@qq.com` / `@outlook.com`),不要用 `example.com` / `test.com` 这类保留域名。

### 8.2 注册成功但 `signIn` 返回 `Email not confirmed`

`Confirm email` 是开着的。两条路:
- (开发)Dashboard 关掉 Confirm email
- (生产)用 `UPDATE auth.users SET email_confirmed_at = now() WHERE email_confirmed_at IS NULL` SQL 临时确认;或者用户查收邮件点链接

### 8.3 后端 401 跨域报错

后端 `main.ts` 已 `app.enableCors({ origin: true, credentials: true })`,本地 dev 应该没问题。如果生产域名跨域,在 CORS 白名单里加你的前端域名。

### 8.4 RLS 拒绝合法写入

用 `postgres` 角色直连 5432 不会受 RLS 限制(它是 DB owner)。如果用 `service_role` 角色,RLS 也被绕过。如果用 `anon` / `authenticated` 角色,RLS 才生效。

本项目后端用 `postgres` 角色直连,**RLS 在 service 层**显式 `where user_id = $uid` 保证。如果接了 Supabase PostgREST(让前端直连 Supabase),那时 RLS 才真正派上用场。

### 8.5 端口 5000 被 macOS AirPlay 占用

macOS Monterey+ 把 AirPlay Receiver 设在 5000。**关掉**:
- 系统设置 → 通用 → 隔空播放接收器 → 关闭

或者直接让 Taro 顺延到 5001/5002。

## 9. 后续 TODO

- [ ] 在部署环境补齐 TOS 与视觉模型凭据，完成图片上传、识图和结果落笔记验收
- [ ] 把已验证的 Realtime 鉴权扩展到 `stocks` / `notes` 页面级实时更新
- [ ] 多用户并发优化(每日同步 cron 当前 `for await uids` 是串行)
- [ ] 移除写死 `DEFAULT_USER_ID` fallback(强制所有写必须带 JWT)
- [ ] 建立迁移自动执行和生产发布检查流程

## 10. 相关文件

- `server/migrations/0001_init.sql` — Schema + RLS
- `server/migrations/0002_stock_status.sql` — 股票状态机字段
- `server/migrations/0003_brief_signal.sql` — stock_briefs 表
- `server/migrations/0004_stock_prices_unique.sql` — 日线用户维度唯一键
- `server/migrations/0005_error_logs.sql` — 内部错误监控表
- `server/migrations/0006_daily_brief_upsert.sql` — 简评与自动笔记幂等键
- `server/migrations/0007_schema_consistency.sql` — 股票唯一键与 Schema 一致性修复
- `server/src/storage/auth/` — JwtGuard + 装饰器
- `server/src/api-auth/` — AuthController / Service
- `server/src/ai/daily-brief.service.ts` — 每日简评(技术指标 + LLM)
- `src/auth/session.ts` — 前端 session 持久化
- `src/pages/login/index.tsx` — 登录页
- `src/pages/buy/index.tsx` — 买入表单
- `src/pages/stock/index.tsx` — 状态徽章 + 持仓卡 + 止损条 + brief 时间线
- `src/network.ts` — 自动注入 Bearer 头 + 401 单次续期与请求重放

## 11. 状态机与简评

详细的产品规则、数据流、API 速查见 [docs/STATE_MACHINE.md](STATE_MACHINE.md)。简要:

- 每只股票 2 状态:`watching` / `holding`
- 进入 `holding` 必填三件套:`entry_price` / `buy_reason` / `loss_rate`(%)
- 每日简评输出约 100 字单段自然语言 + `green/yellow/red` 信号
- 持久化时将信号兼容映射为旧字段:`green`→`hold` / `yellow`→`review` / `red`→`sell`
- 止损:`actual_loss_rate >= loss_rate` 强制覆盖为 `sell + red`
- 不做:自动判断买点、减仓/加仓；小程序订阅消息和邮件推送仍为后续项

## 12. 依赖收敛(2026-06-14)

切换到 Supabase 后，**不再使用** `coze-coding-dev-sdk` 提供的 `getDb` / 数据库相关能力。

Coze SDK **仍被使用** 的部分(不要卸载):
- `S3Storage` — `server/src/upload/` 的 TOS/S3 兼容上传

`server/src/ai/ai.module.ts` 仍有一个不参与运行的 `LLMClient` 兼容引用，可在后续依赖清理时删除。若要彻底卸载 SDK，需要先替换当前 `S3Storage` 上传实现。
