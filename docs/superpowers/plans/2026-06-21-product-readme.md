# Product README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generated Taro-style README with a concise GitHub homepage for the A-share research notes and AI Agent product.

**Architecture:** Keep one root `README.md` as the entry point and link detailed operational material instead of duplicating it. Every feature statement must be backed by current routes, scripts, or project documentation; every command must exist in `package.json`.

**Tech Stack:** Markdown, pnpm scripts, Taro 4, React, NestJS, Supabase, Docker Compose.

---

### Task 1: Verify the product and command inventory

**Files:**
- Reference: `src/app.config.ts`
- Reference: `package.json`
- Reference: `docs/ROADMAP.md`
- Reference: `docs/STATE_MACHINE.md`
- Reference: `docs/DOCKER.md`

- [ ] **Step 1: Inspect user-facing routes and scripts**

```bash
sed -n '1,220p' src/app.config.ts
node -e "const p=require('./package.json'); console.log(Object.keys(p.scripts).sort().join('\\n'))"
```

Expected: routes include watchlist, stock details, notes, AI reports, Agent chat, login and supporting flows; scripts include local, Docker, H5, WeChat, backend and test commands.

- [ ] **Step 2: Confirm documentation targets exist**

```bash
test -f docs/DOCKER.md
test -f docs/SUPABASE.md
test -f docs/ROADMAP.md
test -f docs/STATE_MACHINE.md
test -f docs/superpowers/AGENT_RELEASE_NOTES_2026-06-19.md
```

Expected: command exits `0`.

### Task 2: Rewrite the GitHub project homepage

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace generated-framework content with the approved structure**

Write these sections in order:

```markdown
# Stock Notes
产品定位与支持端说明

## 核心能力
## 技术架构
## 快速开始
### 环境要求
### 最低环境变量
### 本地启动
## Docker 运行
## 构建与测试
## 项目结构
## 开发约束
## 进一步阅读
```

The minimum environment block must contain only:

```dotenv
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_PASSWORD=
# 或：SUPABASE_DB_URL=
```

Link optional configuration to `.env.example`. Include `pnpm dev`, `pnpm docker:dev`, `pnpm docker:prod:build`, `pnpm docker:prod`, `pnpm docker:build:weapp`, `pnpm validate`, `pnpm test:prelaunch`, `pnpm test:agent:all`, and `pnpm test:docker`. State that Douyin Docker support is canceled while the existing non-Docker `pnpm build:tt` remains available.

- [ ] **Step 2: Remove obsolete generated tutorial material**

Delete the full UI component inventory, generic page scaffolding examples, Taro request tutorial, and other framework boilerplate. Keep only project-specific rules: pnpm, `@/components/ui`, `Network`, Tailwind, and relative `/api` URLs.

### Task 3: Validate README accuracy and repository quality

**Files:**
- Test: `README.md`
- Test: `package.json`

- [ ] **Step 1: Verify every documented pnpm command exists**

```bash
node - <<'NODE'
const fs = require('node:fs')
const scripts = require('./package.json').scripts
const readme = fs.readFileSync('README.md', 'utf8')
const builtins = new Set(['install'])
for (const name of [...readme.matchAll(/pnpm ([a-z][a-z0-9:-]*)/g)].map((match) => match[1])) {
  if (!scripts[name] && !builtins.has(name)) {
    throw new Error(`README references missing script: ${name}`)
  }
}
NODE
```

Expected: command exits `0`.

- [ ] **Step 2: Verify local documentation links**

```bash
node - <<'NODE'
const fs = require('node:fs')
const readme = fs.readFileSync('README.md', 'utf8')
for (const [, target] of readme.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
  if (/^(?:https?:|#)/.test(target)) continue
  if (!fs.existsSync(target)) throw new Error(`README link does not exist: ${target}`)
}
NODE
```

Expected: command exits `0`.

- [ ] **Step 3: Run project gates**

```bash
pnpm validate
pnpm test:prelaunch
pnpm test:docker
git diff --check -- README.md
```

Expected: all commands exit `0`.

- [ ] **Step 4: Commit only README**

```bash
git add README.md
git commit -m "docs: 重写项目 README"
```
