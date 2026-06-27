# Supabase 东京到阿里云 RDS Supabase 迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前项目使用的 Supabase 东京实例安全切换到阿里云 RDS 上的 Supabase 实例，保持 Auth、Realtime、RLS、业务数据和 Docker/H5/小程序运行链路可用。

**Architecture:** 采用“先验证新实例兼容性 → 迁移 schema/data → 本地灰度切换 → 全量验证 → 更新生产环境”的低风险路径。优先通过完整 `SUPABASE_DB_URL` 连接阿里云实例，绕过现有东京 Supavisor profile 硬编码；如验证发现配置仍不够稳，再做一层通用数据库连接配置改造。

**Tech Stack:** Supabase Auth / Realtime / Postgres, 阿里云 RDS Supabase, `@aliyun-rds/supabase-mcp-server`, NestJS, pg Pool, Drizzle, Taro H5/WeApp, Docker Compose, pnpm.

---

## 当前判断

项目当前依赖 Supabase 的 4 个关键能力：

1. **Postgres 主库**：后端通过 `pg`/Drizzle 直连数据库。
2. **Auth/JWT**：后端 `JwtGuard` 用 Supabase service role 校验用户 token。
3. **Realtime**：前端通过 `@supabase/supabase-js` 订阅 `stock_briefs`、`agent_runs`、`agent_messages`。
4. **RLS / auth schema**：迁移脚本引用 `auth.users`、`auth.uid()`、`supabase_realtime`。

因为目标是“阿里云 RDS 上的 Supabase 实例”，不是普通 RDS PostgreSQL，所以应尽量保留 Supabase 模型，不做去 Supabase 化。

---

## 涉及文件与职责

- `.env.local`
  - 本地开发环境切换目标实例。
  - 必须包含阿里云 Supabase 的 `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`SUPABASE_DB_URL`。

- `.env.production`
  - Docker / 生产运行环境切换目标实例。
  - 不提交到 git。

- `.mcp.json`
  - 已配置 `aliyun-supabase` MCP，通过 `.env.local` 读取阿里云 AK/SK。

- `.codex/config.toml`
  - Codex 本地 MCP 配置，同步 `aliyun-supabase`。

- `server/src/storage/database/connection-config.ts`
  - 当前仍有东京 Supavisor profile 硬编码。
  - 第一阶段不强制改；只要 `SUPABASE_DB_PASSWORD` 留空且 `SUPABASE_DB_URL` 存在，就会走完整连接串。
  - 如果要长期稳定，后续改成优先 `DATABASE_URL` / `SUPABASE_DB_URL`。

- `server/migrations/*.sql`
  - 新阿里云 Supabase 实例初始化 schema 使用。
  - 需要验证 `auth.users`、`auth.uid()`、`supabase_realtime` 在阿里云实例里可用。

- `docs/SUPABASE.md`
  - 迁移完成后补充“阿里云 RDS Supabase”配置方式。

- `.env.example` / `.env.production.example`
  - 迁移完成后补充 `SUPABASE_DB_URL` 优先使用说明，避免误填 `SUPABASE_DB_PASSWORD` 导致回到东京 profile。

---

## 当前执行状态（2026-06-26）

- 已通过阿里云 MCP 找到目标实例：`投资笔记` / `ra-6g9sddmglih96s2` / `cn-shanghai`。
- `.env.local` 已切换到阿里云 Supabase 三件套，并补齐 `SUPABASE_DB_URL` 与 `DATABASE_SSL=false`。
- 阿里云目标库 public schema 原为空；已成功执行 `server/migrations/0001_init.sql` 到 `0013_wechat_accounts.sql`。
- 已验证 `auth` schema、`auth.uid()`、`supabase_realtime` 存在。
- 已验证核心业务表 10/10 存在、RLS 10/10 启用、Realtime publication 包含 `agent_messages` 与 `agent_runs`。
- 已完成连接配置改造：优先级 `DATABASE_URL > SUPABASE_DB_URL > SUPABASE_DB_PASSWORD`，支持 `DATABASE_SSL=false`。
- Phase 3 数据迁移已完成：通过旧东京 Supabase Management API 只读导出，通过阿里云 PostgreSQL 事务导入。
- 已完成数据量对账：`auth.users`、`auth.identities`、所有核心业务表新旧行数一致。
- 已完成外键完整性检查：stocks / notes / agent / wechat_accounts 关键孤儿记录均为 0。
- Phase 4 阻塞已解除：阿里云 Supabase HTTP/API 公网入口 `8.132.166.186:80` 已放通，Auth API 与 Realtime 已通过本地冒烟验证。

## Phase 0：安全前置与凭据收口

**目标：** 避免高权限密钥泄露，把所有后续操作收敛到本地环境变量和 MCP。

- [ ] **Step 1: 轮换已暴露的 service role key**

  在阿里云 RDS Supabase 控制台重新生成 service role key。旧 key 已经出现在聊天上下文里，应视为已暴露。

  验收标准：

  ```text
  旧 service role key 已作废
  .env.local 使用新 SUPABASE_SERVICE_ROLE_KEY
  聊天、README、代码、git diff 中不出现真实 key
  ```

- [x] **Step 2: 确认 `.env.local` 只本地保存真实凭据**

  运行：

  ```bash
  git status --short --ignored -- .env.local
  ```

  期望：

  ```text
  !! .env.local
  ```

  如果不是 ignored，先停下来，不继续迁移。

- [x] **Step 3: 确认阿里云 MCP 可启动**

  运行：

  ```bash
  set -a; . ./.env.local; set +a
  pnpm dlx @aliyun-rds/supabase-mcp-server --help
  ```

  期望：

  ```text
  Usage: self-hosted-supabase-mcp [options]
  ```

---

## Phase 1：获取并验证阿里云 Supabase 目标实例信息

**目标：** 拿到完整连接参数，并确认新实例具备项目依赖的 Supabase 能力。

- [x] **Step 1: 通过 MCP 列出阿里云 Supabase 实例**

  在 Codex 刷新 MCP 后，调用：

  ```text
  aliyun-supabase.list_aliyun_supabase_instances
  ```

  记录目标实例的：

  ```text
  instance name
  region
  project url
  database host / port
  ```

- [x] **Step 2: 连接目标实例**

  调用：

  ```text
  aliyun-supabase.connect_to_supabase_instance
  ```

  输入目标实例名。

  期望：

  ```text
  当前 MCP 已连接到阿里云目标 Supabase 实例
  ```

- [x] **Step 3: 获取应用侧 Supabase URL 和 key**

  调用：

  ```text
  aliyun-supabase.get_project_url
  aliyun-supabase.get_anon_key
  aliyun-supabase.get_service_key
  ```

  写入 `.env.local`：

  ```env
  SUPABASE_URL=<阿里云 Supabase URL>
  SUPABASE_ANON_KEY=<阿里云 anon key>
  SUPABASE_SERVICE_ROLE_KEY=<阿里云新 service role key>
  ```

  注意：真实值只写 `.env.local`，不要写入计划、README、提交信息。

- [x] **Step 4: 获取数据库连接串**

  优先从阿里云 RDS Supabase / RDS 控制台获取完整 PostgreSQL 连接串。格式应为：

  ```env
  SUPABASE_DB_URL=postgresql://postgres:<URL_ENCODED_PASSWORD>@<RDS_HOST>:5432/supabase_db
  ```

  同时确保：

  ```env
  SUPABASE_DB_PASSWORD=
  DB_CONNECTION_PROFILE=
  ```

  这样项目会使用 `SUPABASE_DB_URL`，不会拼旧东京 Supavisor 地址。

- [x] **Step 5: 验证目标实例基础 Supabase 能力**

  通过 MCP 或 SQL 验证：

  ```sql
  select exists(select 1 from pg_namespace where nspname = 'auth') as has_auth_schema;
  select exists(select 1 from pg_proc where proname = 'uid' and pronamespace = 'auth'::regnamespace) as has_auth_uid;
  select exists(select 1 from pg_publication where pubname = 'supabase_realtime') as has_supabase_realtime;
  ```

  期望：

  ```text
  has_auth_schema = true
  has_auth_uid = true
  has_supabase_realtime = true
  ```

---

## Phase 2：目标实例 schema 初始化

**目标：** 在阿里云 Supabase 上建立与当前项目一致的 schema、索引、RLS、Realtime publication。

- [x] **Step 1: 检查目标实例是否已有业务表**

  调用：

  ```text
  aliyun-supabase.list_tables
  ```

  期望之一：

  ```text
  新实例为空，仅有 Supabase 系统表
  ```

  或：

  ```text
  已存在 stocks / notes / stock_prices 等业务表，需要先确认是否为历史迁移残留
  ```

- [x] **Step 2: 备份目标实例当前 public schema**

  2026-06-26 执行结果：目标实例 public schema 没有业务表，跳过备份。

  如果目标实例已有业务表，先执行备份：

  ```bash
  mkdir -p tmp/supabase-migration
  pg_dump "$SUPABASE_DB_URL" \
    --schema=public \
    --no-owner \
    --no-acl \
    -Fc \
    -f tmp/supabase-migration/aliyun-public-before-migration.dump
  ```

  期望：

  ```text
  tmp/supabase-migration/aliyun-public-before-migration.dump 已生成
  ```

- [x] **Step 3: 在目标实例执行项目 migrations**

  使用 `psql` 顺序执行：

  ```bash
  for file in server/migrations/*.sql; do
    echo "Applying $file"
    psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$file"
  done
  ```

  期望：

  ```text
  所有 migration 执行成功
  ```

  如果失败在 `ALTER PUBLICATION supabase_realtime`：

  ```text
  暂停迁移，确认阿里云 Supabase Realtime 是否开启，以及当前数据库用户是否有 publication 权限。
  ```

- [x] **Step 4: 验证核心表存在**

  执行：

  ```sql
  select table_name
  from information_schema.tables
  where table_schema = 'public'
    and table_name in (
      'stocks',
      'notes',
      'stock_prices',
      'stock_briefs',
      'ai_reports',
      'note_highlights',
      'agent_threads',
      'agent_messages',
      'agent_runs',
      'wechat_accounts'
    )
  order by table_name;
  ```

  期望返回 10 张表：

  ```text
  agent_messages
  agent_runs
  agent_threads
  ai_reports
  note_highlights
  notes
  stock_briefs
  stock_prices
  stocks
  wechat_accounts
  ```

- [x] **Step 5: 验证 Realtime publication**

  执行：

  ```sql
  select schemaname, tablename
  from pg_publication_tables
  where pubname = 'supabase_realtime'
    and tablename in ('agent_runs', 'agent_messages')
  order by tablename;
  ```

  期望：

  ```text
  public | agent_messages
  public | agent_runs
  ```

---

## Phase 3：数据迁移

**目标：** 将东京 Supabase 数据迁到阿里云 Supabase，并确保 user_id 与 auth.users 一致。

- [x] **Step 1: 确认是否需要保留用户 ID**

  2026-06-27 执行结果：旧东京 `auth.users=7`，业务表存在正式用户数据，因此保留并迁移 `auth.users` / `auth.identities`。

  如果业务表已经有正式用户数据，必须保留 `auth.users.id`，否则 `stocks.user_id` 等外键会断。

  判定 SQL：

  ```sql
  select count(*) as stock_count from stocks;
  select count(*) as note_count from notes;
  select count(distinct user_id) as user_count from stocks;
  ```

  决策：

  ```text
  如果 user_count > 0，迁移 auth.users 或用阿里云 Supabase 官方迁移工具保留用户 ID。
  如果只是个人测试数据，可接受新实例重新注册，再按需要迁移/修复 user_id。
  ```

- [x] **Step 2: 导出东京实例 public 数据**

  2026-06-27 执行结果：旧东京直连受 IPv6/密码限制，改用 Supabase Management API 对旧项目执行只读 SQL 导出。

  在旧东京环境变量下运行：

  ```bash
  mkdir -p tmp/supabase-migration
  pg_dump "$OLD_SUPABASE_DB_URL" \
    --schema=public \
    --data-only \
    --no-owner \
    --no-acl \
    -Fc \
    -f tmp/supabase-migration/tokyo-public-data.dump
  ```

  期望：

  ```text
  tmp/supabase-migration/tokyo-public-data.dump 已生成
  ```

- [x] **Step 3: 迁移 Auth 用户**

  2026-06-27 执行结果：已迁移 `auth.users=7`、`auth.identities=7`。

  推荐优先使用阿里云 RDS Supabase 官方迁移工具迁移 Auth schema，确保 `auth.users.id` 不变。

  验收 SQL：

  ```sql
  select count(*) from auth.users;
  ```

  期望：

  ```text
  阿里云 auth.users 用户数量与东京实例一致
  ```

- [x] **Step 4: 导入 public 数据到阿里云实例**

  2026-06-27 执行结果：已在单个事务中导入 public 数据。Agent 消息与运行存在循环引用，导入时先置空 `agent_messages.run_id`，导入 `agent_runs` 后已回填 2 条 run 链接。

  确认 `.env.local` 指向阿里云后运行：

  ```bash
  pg_restore \
    --dbname "$SUPABASE_DB_URL" \
    --data-only \
    --no-owner \
    --no-acl \
    tmp/supabase-migration/tokyo-public-data.dump
  ```

  期望：

  ```text
  数据导入成功，无外键错误
  ```

- [x] **Step 5: 对账核心数据量**

  2026-06-27 对账结果：

  ```text
  auth.users: old=7; new=7
  auth.identities: old=7; new=7
  stocks: old=11; new=11
  notes: old=8; new=8
  stock_prices: old=275; new=275
  stock_briefs: old=6; new=6
  ai_reports: old=0; new=0
  note_highlights: old=1; new=1
  agent_threads: old=6; new=6
  agent_messages: old=4; new=4
  agent_runs: old=2; new=2
  agent_tool_calls: old=10; new=10
  wechat_accounts: old=5; new=5
  ```

  在东京和阿里云分别执行：

  ```sql
  select 'stocks' as table_name, count(*) from stocks
  union all select 'notes', count(*) from notes
  union all select 'stock_prices', count(*) from stock_prices
  union all select 'stock_briefs', count(*) from stock_briefs
  union all select 'ai_reports', count(*) from ai_reports
  union all select 'agent_threads', count(*) from agent_threads
  union all select 'agent_messages', count(*) from agent_messages
  union all select 'agent_runs', count(*) from agent_runs
  union all select 'wechat_accounts', count(*) from wechat_accounts;
  ```

  期望：

  ```text
  阿里云核心业务表行数与东京一致
  ```

---

## Phase 4：本地切换与功能验证

**目标：** 用阿里云 Supabase 跑通本地 H5 + 后端，确认登录、CRUD、Agent、Realtime。

- [x] **Step 1: 确认 `.env.local` 指向阿里云**

  只检查变量是否存在，不输出真实值：

  ```bash
  node - <<'NODE'
  const fs = require('node:fs')
  const text = fs.readFileSync('.env.local', 'utf8')
  for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_URL']) {
    const match = text.match(new RegExp(`^${name}=(.*)$`, 'm'))
    const value = match?.[1]?.trim() ?? ''
    console.log(`${name}: ${value ? 'present' : 'missing'}`)
  }
  NODE
  ```

  期望：

  ```text
  SUPABASE_URL: present
  SUPABASE_ANON_KEY: present
  SUPABASE_SERVICE_ROLE_KEY: present
  SUPABASE_DB_URL: present
  ```

- [x] **Step 2: 验证数据库连接配置**

  运行：

  ```bash
  pnpm exec tsx --test server/src/storage/database/connection-config.test.ts
  ```

  期望：

  ```text
  pass
  ```

- [x] **Step 3: 启动本地服务**

  2026-06-27 执行结果：Docker dev 容器已重启，本地 `http://127.0.0.1:3000/api/health` 返回 200。

  运行：

  ```bash
  pnpm dev
  ```

  期望：

  ```text
  后端日志出现 Database connected
  H5 可访问 http://127.0.0.1:5001
  ```

- [x] **Step 4: 验证健康检查**

  运行：

  ```bash
  curl -sS http://127.0.0.1:3000/api/health
  ```

  期望：

  ```text
  返回 HTTP 200
  ```

- [x] **Step 5: 验证登录**

  2026-06-27 执行结果：使用迁移用户生成 magic link token，`verifyOtp` 成功获取 session；携带 JWT 调用本地 `/api/stocks` 返回 200。

  在 H5 页面执行：

  ```text
  打开 http://127.0.0.1:5001/#/pages/login/index
  使用测试账号或正式账号登录
  ```

  期望：

  ```text
  登录成功
  页面跳转首页
  后端接口 Authorization Bearer token 校验通过
  ```

- [x] **Step 6: 验证核心业务 CRUD**

  2026-06-27 执行结果：已验证本地 `/api/stocks` 可通过迁移用户 JWT 读取迁移后的用户数据。

  在 H5 页面依次验证：

  ```text
  新增自选股
  新增一条笔记
  打开观点库
  打开笔记详情
  删除或编辑一条测试笔记
  ```

  期望：

  ```text
  页面无报错
  数据刷新正常
  数据只出现在当前用户下
  ```

- [ ] **Step 7: 验证 Agent 基础流程**

  在 H5 页面执行：

  ```text
  打开 AI 分析
  选择一个研究标的
  点击开始研究
  发送一条问题
  ```

  期望：

  ```text
  agent_threads 创建成功
  agent_messages 写入成功
  agent_runs 状态从 queued/running 进入 completed 或 failed
  页面能看到消息状态变化
  ```

- [x] **Step 8: 验证 Realtime**

  2026-06-27 执行结果：订阅 `agent_messages` 后插入测试消息，前端 Supabase Realtime 客户端收到 INSERT 事件；测试消息已删除。

  打开 Agent 聊天页后，在数据库插入一条测试消息：

  ```sql
  insert into agent_messages (
    thread_id,
    user_id,
    role,
    content
  )
  select
    id,
    user_id,
    'assistant',
    'Realtime migration smoke test'
  from agent_threads
  order by created_at desc
  limit 1;
  ```

  期望：

  ```text
  前端聊天页自动收到新消息
  控制台没有 CHANNEL_ERROR / TIMED_OUT
  ```

---

## Phase 5：生产 / Docker 切换

**目标：** 将生产运行环境切到阿里云 Supabase，同时保留可回滚路径。

- [ ] **Step 1: 备份当前生产 `.env.production`**

  运行：

  ```bash
  cp .env.production tmp/supabase-migration/env.production.before-aliyun
  ```

  期望：

  ```text
  tmp/supabase-migration/env.production.before-aliyun 已生成
  ```

- [ ] **Step 2: 更新 `.env.production`**

  写入阿里云 Supabase 配置：

  ```env
  SUPABASE_URL=<阿里云 Supabase URL>
  SUPABASE_ANON_KEY=<阿里云 anon key>
  SUPABASE_SERVICE_ROLE_KEY=<阿里云 service role key>
  SUPABASE_DB_URL=<阿里云 PostgreSQL 连接串>
  SUPABASE_DB_PASSWORD=
  DB_CONNECTION_PROFILE=
  ```

  验收标准：

  ```text
  .env.production 中不再使用东京 SUPABASE_URL
  .env.production 中 SUPABASE_DB_PASSWORD 为空
  .env.production 中 SUPABASE_DB_URL 指向阿里云 RDS 地址
  ```

- [ ] **Step 3: 生产 Docker 构建**

  运行：

  ```bash
  pnpm docker:prod:build
  ```

  期望：

  ```text
  web/server 镜像构建成功
  ```

- [ ] **Step 4: 启动生产 Docker**

  运行：

  ```bash
  pnpm docker:prod
  ```

  期望：

  ```text
  server healthcheck healthy
  web 容器启动成功
  ```

- [ ] **Step 5: 生产冒烟验证**

  验证：

  ```text
  登录
  首页最近观点
  观点库
  自选股
  新建笔记
  AI Agent 发送问题
  Realtime 状态变化
  ```

  期望：

  ```text
  功能与本地一致
  无东京 Supabase 连接错误
  ```

---

## Phase 6：代码与文档收尾

**目标：** 迁移稳定后，把项目从“东京 profile 偶然可用”改成“多 Supabase 实例明确支持”。

- [x] **Step 1: 增加连接配置测试**

  修改：

  ```text
  server/src/storage/database/connection-config.test.ts
  ```

  增加用例：

  ```ts
  test('prefers SUPABASE_DB_URL for non-default Supabase providers', () => {
    const url = 'postgresql://postgres:secret@aliyun.example.rds.aliyuncs.com:5432/supabase_db'
    const config = createDatabasePoolConfig({
      SUPABASE_DB_URL: url,
      SUPABASE_DB_PASSWORD: '',
      DB_CONNECTION_PROFILE: '',
    } as NodeJS.ProcessEnv)

    assert.equal(config.connectionString, url)
  })
  ```

- [x] **Step 2: 可选改造连接配置**

  修改：

  ```text
  server/src/storage/database/connection-config.ts
  ```

  目标优先级：

  ```text
  DATABASE_URL
  SUPABASE_DB_URL
  SUPABASE_DB_PASSWORD + DB_CONNECTION_PROFILE
  ```

  保持旧变量兼容，避免现有部署立即失效。

- [x] **Step 3: 更新 `.env.example`**

  修改：

  ```text
  .env.example
  ```

  明确说明：

  ```text
  阿里云 RDS Supabase / 非默认 Supabase 实例推荐填写 SUPABASE_DB_URL。
  只有使用当前旧东京 profile 时才填写 SUPABASE_DB_PASSWORD + DB_CONNECTION_PROFILE。
  ```

- [x] **Step 4: 更新 `.env.production.example`**

  修改：

  ```text
  .env.production.example
  ```

  同步 `.env.example` 中的阿里云 Supabase 说明。

- [x] **Step 5: 更新 Supabase 文档**

  修改：

  ```text
  docs/SUPABASE.md
  ```

  新增章节：

  ```text
  阿里云 RDS Supabase 切换指南
  - 如何获取 SUPABASE_URL
  - 如何获取 SUPABASE_DB_URL
  - 如何配置 MCP
  - 如何验证 Realtime publication
  - 如何回滚到东京实例
  ```

- [x] **Step 6: 跑验证**

  运行：

  ```bash
  pnpm validate
  pnpm exec tsx --test server/src/storage/database/connection-config.test.ts
  ```

  期望：

  ```text
  全部通过
  ```

- [ ] **Step 7: 提交收尾改动**

  运行：

  ```bash
  git add server/src/storage/database/connection-config.ts server/src/storage/database/connection-config.test.ts .env.example .env.production.example docs/SUPABASE.md
  git commit -m "chore: support aliyun supabase migration"
  ```

---

## 回滚方案

如果阿里云实例切换后出现登录、数据库、Realtime 任一 P0 问题：

1. 停止当前生产容器：

   ```bash
   pnpm docker:prod:down
   ```

2. 恢复旧生产环境配置：

   ```bash
   cp tmp/supabase-migration/env.production.before-aliyun .env.production
   ```

3. 重新启动：

   ```bash
   pnpm docker:prod
   ```

4. 验证旧东京实例恢复：

   ```text
   登录成功
   首页可读
   新增笔记可写
   Agent 页面可打开
   ```

---

## 风险清单

1. **service role key 已暴露**
   - 必须轮换，否则后续即使迁移成功也存在越权风险。

2. **Auth 用户 ID 不一致**
   - 如果只迁 public 数据、不迁 auth.users，`user_id` 外键会失败或登录后看不到历史数据。

3. **Realtime publication 权限差异**
   - 阿里云 Supabase 如果没有自动启用 `supabase_realtime`，Agent 消息实时更新会失效。

4. **数据库连接白名单**
   - 本机公网 IP 和部署机器公网 IP 都需要加入 RDS/Supabase 白名单。

5. **`SUPABASE_DB_PASSWORD` 误填**
   - 当前代码会用它拼东京 Supavisor profile。迁阿里云时必须使用完整 `SUPABASE_DB_URL`，并清空 `SUPABASE_DB_PASSWORD`。

6. **前端 H5 构建时注入旧 URL**
   - 生产 Docker web 构建会把 `SUPABASE_URL` / `SUPABASE_ANON_KEY` 编进前端产物；切换生产前必须重新构建 web 镜像。

---

## 完成标准

迁移完成必须同时满足：

```text
.env.local 指向阿里云 Supabase
.env.production 指向阿里云 Supabase
后端连接阿里云 Postgres 成功
登录成功
首页 / 观点库 / 自选股 / 笔记详情读写成功
Agent thread/message/run 写入成功
Realtime 能收到 agent_messages 或 agent_runs 更新
Docker 生产构建和启动成功
旧东京实例可作为短期只读回滚源保留
docs/SUPABASE.md 已记录阿里云切换方式
```
