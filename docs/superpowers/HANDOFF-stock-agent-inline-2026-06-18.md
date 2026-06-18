# 股票研究 Agent Inline Execution 交接

## 工作区

- 仓库：`/Users/bytedance/Documents/codex-projects/stock_notes`
- 隔离工作区：`/Users/bytedance/.config/superpowers/worktrees/stock_notes/codex-stock-agent-inline`
- 分支：`codex/stock-agent-inline`
- 当前 HEAD：`e57c1b0 feat: 统一模型调用错误`
- 不要使用已有的 `codex/stock-agent` 工作区；其中有另一组未跟踪 Agent 草稿。
- 包管理器只能使用 `pnpm`。

## 计划与规格

- 总索引：`docs/superpowers/specs/2026-06-18-stock-agent-delivery-index.md`
- 当前执行计划：`docs/superpowers/plans/2026-06-18-stock-agent-batch-2-model-providers.md`
- 后续依次执行批次 3、4、5 的同日期计划。
- 执行方式为 Superpowers Inline Execution；功能开发遵守 TDD：先 RED，再最小 GREEN，再构建/验证、提交。

## 已完成

### 批次 1：数据模型与领域契约

已提交：

- `b939014 feat: 定义 Agent 领域契约`
- `5181f62 feat: 新增 Agent 核心数据模型`
- `012e243 feat: 实现 Agent 持久化边界`
- `a4e2b30 feat: 新增 Agent 基础查询接口`

本地门禁证据：

- `pnpm test:agent:batch1`：15/15 通过。
- `pnpm validate`：ESLint 与前端 TypeScript 通过。
- `pnpm build:server`：通过。

用户已明确允许继续代码实现，并把真实 Supabase 应用留到最终门禁。当前环境没有 `SUPABASE_DB_URL`、`SUPABASE_ACCESS_TOKEN`、Supabase CLI 或 `psql`，因此以下尚未执行：

- 应用 `server/migrations/0009_agent_core.sql` 到真实 Supabase。
- 实库验证 RLS、Data API grants、`supabase_realtime` publication 和并发约束。

### 批次 2：已完成并提交的部分

- `9915a73 feat: 定义 Agent Provider 协议`
- `4cc481d feat: 配置 Agent 模型目录`
- `e57c1b0 feat: 统一模型调用错误`

已覆盖：

- 中立 Provider request/result/tool/health 类型。
- DeepSeek、OpenAI、MiniMax 配置目录。
- MiniMax `api|coding_plan` 在 production 均可配置。
- 七类安全错误映射；429/额度/鉴权不自动重试。
- `.env.example` 仅包含空凭据变量。

## 当前未提交工作

以下 6 个文件为 Batch 2 Provider adapter WIP：

- `server/src/agent/providers/openai-compatible.ts`
- `server/src/agent/providers/deepseek.provider.ts`
- `server/src/agent/providers/openai.provider.ts`
- `server/src/agent/providers/minimax.provider.ts`
- `server/src/agent/providers/provider-registry.ts`
- `server/src/agent/providers/provider-adapters.test.ts`

当前证据：

- `pnpm exec tsx --test --tsconfig=server/tsconfig.json server/src/agent/providers/provider-adapters.test.ts`：3/3 通过。
- `pnpm build:server`：失败，尚不可提交这些 WIP 文件。

构建失败根因：`CompatibleClient.chat.completions.create` 被声明成接收 `Record<string, unknown>`，与 OpenAI SDK 的重载参数类型不满足函数参数逆变，三个 wrapper 均报 TS2345。不是运行逻辑失败。

建议的最小修复：把 `CompatibleClient` 的 `create` 方法参数改成可兼容 SDK 重载的宽类型（例如 `body: any, options?: any`），或增加一个显式 wrapper 将 OpenAI SDK 收窄为本模块需要的调用接口。不要用三处独立强转掩盖边界问题。修复后依次运行：

```bash
pnpm exec tsx --test --tsconfig=server/tsconfig.json server/src/agent/providers/provider-adapters.test.ts
pnpm build:server
```

两者通过后提交：

```bash
git add server/src/agent/providers
git commit -m "feat: 接入三种 Agent 模型 Provider"
```

## 下一步顺序

1. 修复上述 adapter 类型边界并提交。
2. 按 Batch 2 Task 5 实现 `ProviderHealthService` 和 `GET /api/agent/models`，先写失败测试。
3. 添加 `test:agent:batch2`，运行 Batch 1+2、`pnpm validate`、`pnpm build:server`。
4. 执行批次 3 工具/Tavily/上下文/Orchestrator。
5. 执行批次 4 PostgreSQL Worker、幂等提交、Realtime。
6. 执行批次 5 Taro 对话页、报告闭环和跨端验收。
7. 最后由原 Agent 回来执行全量验证、真实 Supabase 门禁（需凭据）和分支收尾。

## 关键约束

- 不要修改 `@/network`，前端只能使用 `Network` 和 `/api/...` 相对路径。
- NestJS Controller 不得手写 `api` 前缀，所有成功 POST 显式 `@HttpCode(200)`。
- Provider 失败不得静默切换。
- 工具只能使用服务端注入的 `userId/stockId`。
- 通用 UI 必须优先使用 `@/components/ui`；样式优先 Tailwind。
- 图片/视频不得放入项目，TabBar PNG 除外。
- 不要打印或提交任何模型/Supabase 密钥。

## 快速恢复命令

```bash
cd /Users/bytedance/.config/superpowers/worktrees/stock_notes/codex-stock-agent-inline
git status --short
git log --oneline -10
pnpm test:agent:batch1
pnpm exec tsx --test --tsconfig=server/tsconfig.json server/src/agent/providers/provider-adapters.test.ts
pnpm build:server
```
