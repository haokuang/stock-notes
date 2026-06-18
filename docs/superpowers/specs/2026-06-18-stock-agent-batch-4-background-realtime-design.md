# 股票研究 Agent 批次 4：后台 Run 与实时链路设计

## 目标

把批次 3 的同步编排能力接入持久任务 Worker，使消息提交快速返回、任务可恢复、同会话互斥，并通过 Supabase Realtime 向已鉴权前端暴露 Run 和助手消息变化。

## 提交事务

`POST /api/agent/threads/:id/messages` 接收：

```ts
type CreateAgentMessageRequest = {
  content: string
  provider: AgentProvider
  model: string
  clientRequestId: string
}
```

`clientRequestId` 由客户端生成，用于网络重试幂等。单个数据库事务完成：

1. 锁定并验证 Thread 所有权。
2. 验证 Provider/模型当前可选择。
3. 检查是否已有活动 Run。
4. 创建用户消息。
5. 创建 `queued` Run。
6. 返回 Message 与 Run，HTTP 200。

同一用户和 `clientRequestId` 建唯一约束；重复请求返回原结果。存在活动 Run 时返回 HTTP 409 和当前 Run 摘要，不重复创建用户消息。

## Worker 领取

- `agent_runs` 是唯一任务源，不引入第二套队列。
- Worker 使用短事务和 `FOR UPDATE SKIP LOCKED` 领取 `queued` Run。
- 默认并发 2，由环境变量配置且设安全上限。
- 领取时原子写入 `running`、`locked_at`、`locked_by`、`started_at` 和增加 attempt。
- 执行模型期间不持有数据库事务或行锁。
- 心跳更新 `locked_at`；超过租约的 `running` Run 可被恢复扫描器处理。

领取 SQL 封装在专用持久化模块并接受数据库集成测试，不使用 Supabase 客户端“先查再改”模拟锁。

## 状态与阶段

状态负责终态，阶段负责 UI 进度：

- 创建：`queued/queued`
- Worker 领取：`running/loading_context`
- 模型请求：`running/generating`
- 数据工具：`running/calling_tools`
- Tavily：`running/searching`
- 成功：`completed/completed`
- 失败：`failed/failed`

每次阶段变更写 `updated_at`。成功事务同时写助手消息、最终 Tool Call 状态和 Run 完成状态；避免出现 Run 已完成但消息缺失。

## 重试、恢复与取消

- 只对批次 2 标记为 retryable 的 Provider 错误及 Tavily 临时网络错误重试一次。
- 401、403、429、额度耗尽、参数错误、工具权限错误不重试；429 的 `retryAfter` 仍保存供用户稍后手动重试。
- 重试沿用同一 Run，增加 attempt；不得创建重复用户消息。
- 服务启动和定时扫描处理租约过期 Run：尚有次数则重新入队，否则标记失败。
- 90 秒总超时通过 `AbortController` 同时中止 Provider 与工具。
- 首版不提供用户主动取消按钮，但内部支持关闭服务时发出取消信号并让任务由租约恢复。

## Realtime

- 前端订阅 `agent_runs` 的目标 Run 以及 `agent_messages` 的目标 Thread。
- 订阅前沿用现有 JWT 同步机制；退出登录时清理 channel。
- RLS 保证变更只发送给所有者，客户端收到事件后仍校验 `thread_id/run_id`。
- Realtime 断开不是执行失败。前端恢复连接时调用 `GET /api/agent/runs/:id` 和消息列表补齐状态。
- 数据库事件只发送行数据，不承载密钥、原始 prompt 或上游完整错误。

## 手动重试

失败 Run 不直接重置。用户对原消息重试时创建新用户消息或明确的 retry Run 必须保持产品语义一致；首版采用“复制原用户内容创建新 Message + 新 Run”，并通过 metadata 记录 `retryOfRunId`。模型和 Provider 默认沿用原选择，用户可在发送前显式改选。

## 测试与完成条件

- 并发提交测试验证同 Thread 只有一个活动 Run。
- 两个 Worker 并发领取测试验证每个 Run 只执行一次。
- 覆盖幂等请求、临时失败重试一次、不可重试失败、租约恢复和超过次数终止。
- 覆盖成功事务不会产生完成 Run/缺失消息的不一致。
- Realtime 使用两个用户 JWT 验证行隔离，并覆盖断线后的 REST 补偿。
- API/测试客户端可提交消息并观察到阶段、助手消息和终态。
- 专项测试、`pnpm validate` 与 `pnpm build:server` 通过。

