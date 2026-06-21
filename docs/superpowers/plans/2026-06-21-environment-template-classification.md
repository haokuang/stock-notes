# Environment Template Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `.env.example` so every currently supported setting is retained while required, optional, tuning, and production-only variables are unmistakable.

**Architecture:** This is a documentation-only configuration change. The template will mirror actual runtime/build consumers, preserve safe defaults, identify mutually exclusive database credentials, and avoid implying that `.env.local` must contain every optional key.

**Tech Stack:** dotenv templates, Node.js/NestJS/Taro environment configuration, pnpm verification.

---

### Task 1: Reclassify the environment template

**Files:**
- Modify: `.env.example`
- Reference: `server/src/bootstrap/runtime-environment.ts`
- Reference: `server/src/storage/database/connection-config.ts`
- Reference: `server/src/agent/providers/provider-config.ts`
- Reference: `config/index.ts`

- [ ] **Step 1: Record the current supported-variable inventory**

Run:

```bash
rg -n "process\.env\.|env\.[A-Z][A-Z0-9_]*" server src config scripts \
  --glob '!**/*.test.ts'
```

Expected: references cover Supabase, database, market data, optional AI/search/storage/alert features, worker tuning, development proxy, and mini-program build configuration.

- [ ] **Step 2: Rewrite `.env.example` into explicit sections**

Use these section headings and rules:

```dotenv
# 使用说明：复制为 .env.local；只需填写“基础启动必需”，其余按功能启用
# 1. 基础启动必需
# 2. 本地开发可选
# 3. 功能可选
# 4. 运行参数调优
# 5. 生产 / Docker / 构建专用
```

Required section must contain `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and the documented credential choice `SUPABASE_DB_PASSWORD` or `SUPABASE_DB_URL`. Optional groups must retain Tushare, alerts, DeepSeek, OpenAI, MiniMax, vision, Tavily, and TOS. Add the supported-but-missing `H5_PROXY_TARGET`, `AGENT_WORKER_HEARTBEAT_MS`, `APP_PORT`, `TARO_APP_WEAPP_APPID`, `TARO_APP_TT_APPID`, `TARO_APP_TT_EMAIL`, and `TARO_APP_TT_PASSWORD`. Keep `SUPABASE_ACCESS_TOKEN` in an admin-tooling-only subsection. Remove `TAVILY_BASE_URL` because application wiring does not consume it.

- [ ] **Step 3: Verify classification and safety**

Run:

```bash
pnpm validate
pnpm test:prelaunch
pnpm test:docker
git diff --check -- .env.example
git ls-files .env.local .env.production
```

Expected: all commands exit `0`; the final command prints nothing.

- [ ] **Step 4: Commit only the template change**

```bash
git add .env.example
git commit -m "docs: 标注环境变量必需级别"
```
