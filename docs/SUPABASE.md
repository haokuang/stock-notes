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
│  Supabase        │  Postgres 17 (ap-northeast-1)
│  hgpxchebcipyn...│  5 张业务表 + 16 条 RLS 策略
└──────────────────┘
```

## 3. 一次性配置步骤

### 3.1 创建 Supabase 项目

1. 打开 https://supabase.com/dashboard
2. 新建项目,Region 选 **ap-northeast-1(东京)**
3. 设置一个**强密码**(Database Password),记下来 — 之后连 DB 用

### 3.2 跑 SQL 建表 + RLS

打开 Supabase Dashboard → SQL Editor → New query,粘贴 `server/migrations/0001_init.sql` 全部内容,Run。

会建 5 张表 + 16 条 RLS 策略 + 触发器。

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

# DB 直连(5432 session mode,密码是 3.4 重置的那个)
SUPABASE_DB_URL=postgresql://postgres:数据库密码@db.<ref>.supabase.co:5432/postgres

# Personal Access Token(从 https://supabase.com/dashboard/account/tokens 生成)
SUPABASE_ACCESS_TOKEN=sbp_xxx

# 兼容旧版(没用可空):Coze 备用库
# PGDATABASE_URL=

# 开发 fallback:无 JWT 时 server 用这个 user_id 写入(可选)
DEFAULT_USER_ID=<uuid>
```

⚠️ `.env.local` 已在 `.gitignore` 里忽略,不会进 git。但**不要**把 `SUPABASE_SERVICE_ROLE_KEY` 泄露到任何前端 bundle 里(它绕过 RLS)。

## 4. Supabase Auth 配置

### 4.1 关闭邮箱确认(开发用)

Dashboard → Authentication → Providers → Email → **Confirm email** 关闭。

或者保持开启(生产推荐),但用户注册后**必须查邮件点击确认链接**才能登录。

### 4.2 JWT 格式

Supabase 签的 JWT 是 ES256(ECDSA-P256),`alg=ES256`,`kid` 存在 JWK 头里。后端用 `@supabase/supabase-js` 的 `client.auth.getUser(jwt)` 验签,**无需自己实现 JWT 解码**。

Token 寿命默认 1 小时,过期需用 `refresh_token` 刷新(本项目暂未实现自动 refresh,过期跳登录页重新登录)。

## 5. RLS 策略一览

所有 4 张业务表都开启 RLS,16 条策略 = 4 表 × 4 操作(SELECT/INSERT/UPDATE/DELETE),统一规则:

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

**外键约束**:`user_id` 当前**不引用** `auth.users(id)`,因为开发阶段 `DEFAULT_USER_ID` 是写死的 UUID,不在 `auth.users` 表里。生产接 Auth 后再补 `REFERENCES auth.users(id) ON DELETE CASCADE`,Supabase 文档[Securing your API](https://supabase.com/docs/guides/api/securing-your-api)有完整示例。

## 6. 跑起来

```bash
# 1. 装依赖
pnpm install

# 2. (可选)装 server 端 Supabase SDK,根 pnpm 不会自动装
pnpm --filter server add coze-coding-dev-sdk@0.7.24  # 已不需要,只是历史依赖

# 3. 启 dev
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

- [ ] 接 Supabase Storage 迁图片(目前用 TOS / S3 兼容存储)
- [ ] Supabase Realtime 同步新观点(目前靠下拉刷新)
- [ ] 引入 refresh_token 轮换,access_token 过期自动续期
- [ ] 多用户并发优化(每日同步 cron 当前 `for await uids` 是串行)
- [ ] 移除写死 `DEFAULT_USER_ID` fallback(强制所有写必须带 JWT)
- [ ] 把 `user_id` FK 加回 `REFERENCES auth.users(id)`

## 10. 相关文件

- `server/migrations/0001_init.sql` — Schema + RLS
- `server/migrations/0002_stock_status.sql` — 股票状态机字段
- `server/migrations/0003_brief_signal.sql` — stock_briefs 表
- `server/src/storage/auth/` — JwtGuard + 装饰器
- `server/src/api-auth/` — AuthController / Service
- `server/src/ai/daily-brief.service.ts` — 每日简评(技术指标 + LLM)
- `src/auth/session.ts` — 前端 session 持久化
- `src/pages/login/index.tsx` — 登录页
- `src/pages/buy/index.tsx` — 买入表单
- `src/pages/stock/index.tsx` — 状态徽章 + 持仓卡 + 止损条 + brief 时间线
- `src/network.ts` — 自动注入 Bearer 头 + 401 兜底

## 11. 状态机与简评

详细的产品规则、数据流、API 速查见 [docs/STATE_MACHINE.md](STATE_MACHINE.md)。简要:

- 每只股票 2 状态:`watching` / `holding`
- 进入 `holding` 必填三件套:`entry_price` / `buy_reason` / `loss_rate`(%)
- 每日简评 3 段结构化输出:技术分析 / 逻辑判断 / 操作建议
- 操作建议 → 3 色信号:`hold`→绿 / `review`→黄 / `sell`→红
- 止损:`actual_loss_rate >= loss_rate` 强制覆盖为 `sell + red`
- 不做:自动判断买点、减仓/加仓、推送通道

## 12. 依赖收敛(2026-06-14)

切换到 Supabase 后,**不再使用** `coze-coding-dev-sdk` 提供的 `getDb` / 数据库相关能力。代码里 0 处引用,可忽略。

Coze SDK **仍被使用** 的部分(不要卸载):
- `LLMClient` / `SearchClient` — `server/src/ai/`
- `S3Storage` — `server/src/upload/`
- `Config` — 多个模块共享

如果未来想彻底卸 `coze-coding-dev-sdk`,需要先把这 4 个用到 LLM/Storage 的模块迁到 Supabase Storage + 其它 LLM 客户端(如 OpenAI / 豆包原生 SDK),目前不在本迁移范围。
