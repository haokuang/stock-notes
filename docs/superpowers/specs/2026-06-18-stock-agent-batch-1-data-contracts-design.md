# 股票研究 Agent 批次 1：数据模型与领域契约设计

## 目标

建立后续 Provider、编排器、Worker 和前端共同依赖的稳定数据与接口契约。本批不调用任何模型，也不向用户开放完整对话功能。

## 范围

本批包含：

- `agent_threads`、`agent_messages`、`agent_runs`、`agent_tool_calls` 四张表。
- `ai_reports.agent_run_id` 来源绑定。
- RLS、索引、唯一约束、外键和 Realtime publication。
- 后端领域类型、状态机、仓储接口与基础 CRUD API。
- 用户、股票和资源归属隔离测试。

本批不包含 Provider SDK、Tavily、Worker 轮询、前端页面和报告正文生成。

## 数据模型

### agent_threads

- `id varchar(36)`：主键。
- `user_id uuid`：所有者。
- `stock_id varchar(36)`：固定绑定的自选股，删除股票时级联删除。
- `title varchar(200)`：默认取股票名，后续可更新。
- `created_at`、`updated_at`。
- 唯一约束 `(user_id, stock_id)`：首版每只自选股只有一个会话。

### agent_messages

- `id varchar(36)`、`thread_id`、`user_id`。
- `role`：`user | assistant | tool`。
- `content text`。
- `provider`、`model`：用户与助手消息记录本轮实际选择；工具消息允许为空。
- `run_id`：助手与工具消息关联来源 Run。
- `citations jsonb`：助手消息的标准化引用数组，默认 `[]`。
- `metadata jsonb`：Provider response/thread ID 等非业务数据，默认 `{}`。
- `created_at`。
- 按 `(thread_id, created_at, id)` 建稳定历史顺序索引。

### agent_runs

- `id`、`thread_id`、`user_id`、`user_message_id`。
- `provider`、`model`、`credential_mode`。
- `client_request_id varchar(100)`：客户端消息提交幂等键，与 `user_id` 组成唯一约束。
- `status`：`queued | running | completed | failed`。
- `stage`：`queued | loading_context | calling_tools | searching | generating | completed | failed`。
- `attempt_count`、`max_attempts`，首版最大 2 次执行。
- `locked_at`、`locked_by`、`started_at`、`completed_at`。
- `error_code`、`error_message`、`retry_after`。
- `created_at`、`updated_at`。
- 部分唯一索引确保每个 Thread 最多一个 `queued` 或 `running` Run。

### agent_tool_calls

- `id`、`run_id`、`thread_id`、`user_id`。
- `tool_name`、`arguments jsonb`、`result jsonb`。
- `status`：`running | completed | failed`。
- `error_code`、`duration_ms`、`created_at`、`completed_at`。
- 记录审计所需摘要；笔记全文等敏感大对象不得无界复制到 `result`。

### ai_reports

新增可空 `agent_run_id`，外键指向 `agent_runs.id`，并建立唯一索引。旧报告保持为空；一个成功 Run 最多保存一份正式报告。

## 权限与 Realtime

- 四张 Agent 表全部启用 RLS。
- `SELECT`、`INSERT`、`UPDATE`、`DELETE` 策略均同时使用 `TO authenticated` 和 `(select auth.uid()) = user_id` 所有权判断。
- UPDATE 同时设置 `USING` 与 `WITH CHECK`。
- 前端只需要订阅 `agent_runs` 与 `agent_messages`；两表加入 `supabase_realtime` publication。
- 前端不直接通过 Supabase Data API 写表，所有写入仍经 NestJS；RLS 是纵深防御和 Realtime 行过滤依据。
- 迁移需验证 Data API grant 与 publication 实际状态，不把 RLS 等同于表暴露权限。

## 领域契约

领域层统一定义：

```ts
type AgentProvider = 'deepseek' | 'openai' | 'minimax'
type AgentRunStatus = 'queued' | 'running' | 'completed' | 'failed'
type AgentRunStage =
  | 'queued'
  | 'loading_context'
  | 'calling_tools'
  | 'searching'
  | 'generating'
  | 'completed'
  | 'failed'

type AgentCitation = {
  id: string
  title: string
  url: string
  source: string
  snippet: string
  publishedAt: string | null
}
```

数据库字段使用 snake_case，领域对象和 API DTO 使用 camelCase。转换集中在仓储映射器，禁止页面或 Provider 直接消费 Drizzle 行类型。

## API 骨架

- `GET /api/agent/threads?stock_id=...`：返回当前用户对应 Thread 或 `null`。
- `POST /api/agent/threads`：验证股票归属后幂等创建，HTTP 200。
- `GET /api/agent/threads/:id/messages`：游标分页读取标准化消息。
- `GET /api/agent/runs/:id`：返回当前用户 Run。
- `GET /api/agent/reports?stock_id=...`：返回该股已保存 Agent 报告。

`POST /threads/:id/messages` 与保存报告接口在本批只定义 DTO 和服务边界，不注册会产生假运行结果的占位行为。

## 错误与一致性

- 不属于当前用户的股票、Thread、Run 统一表现为 404，避免资源枚举。
- Thread 幂等创建依赖数据库唯一约束处理竞争，不使用“先查再插”作为唯一保障。
- 消息历史固定按 `created_at, id` 排序，避免同毫秒写入乱序。
- 删除股票时级联清理 Thread、Message、Run 和 Tool Call。已保存报告保留 `stock_code`、`stock_name`、正文等快照；`ai_reports.stock_id` 与 `ai_reports.agent_run_id` 均使用 `ON DELETE SET NULL`，报告仍可按 `report_id` 查看。

## 测试与完成条件

- 迁移文本与真实数据库验证覆盖表、约束、RLS、policy、publication 和 `ai_reports` 外键。
- 仓储测试覆盖幂等建 Thread、分页顺序、跨用户隔离与级联删除。
- Controller 测试覆盖 DTO、HTTP 200、404 隐藏和双层 `data` 响应结构。
- `pnpm validate` 与 `pnpm build:server` 通过。
- 测试期间无任何外部模型或 Tavily 网络调用。
