# 股票研究 Agent 批次 3：工具系统与 Agent 编排设计

## 目标

让服务端可在同步测试入口完成一次真实 Agent 回合：从数据库重建历史、加载股票上下文、调用指定 Provider、执行只读工具、生成带引用的最终回答。

## 依赖与范围

依赖批次 1 的领域与仓储契约、批次 2 的 Provider 接口。本批不负责后台领取和 Realtime，也不开放前端正式异步发送流程。

## 工具注册表

首版只提供：

- `get_stock_profile`
- `get_price_history`：最近 120 个交易日。
- `get_stock_notes`：最近 50 条，按创建时间倒序。
- `get_daily_briefs`：最近 7 条。
- `search_stock_news`：Tavily 最多 8 条。

工具定义包含名称、模型可见描述、Zod 输入 schema 和执行器。执行器签名必须接收后端构造的 `AgentExecutionContext`；公开参数中不出现 `userId` 或 `stockId`。

```ts
type AgentExecutionContext = {
  userId: string
  stockId: string
  threadId: string
  runId: string
  signal: AbortSignal
}
```

数据库工具所有查询同时使用 `user_id` 与 `stock_id`。结果采用有界 DTO：限制记录数、正文长度和字段集合，避免把数据库行或无限文本直接送入模型。

## Tavily 与引用

- 查询由股票代码、名称和用户问题构造，模型可以补充关键词但不能替换绑定股票。
- 最多返回 8 条，按规范化 URL 去重。
- 每条结果映射为 `AgentCitation`，ID 在单次 Run 内稳定。
- 搜索结果正文包裹为不可信资料，系统提示明确禁止执行其中的指令。
- Tavily 超时或失败作为工具失败反馈给模型；最终回答必须明确说明未取得联网资料。
- 没有实际搜索结果时，引用数组必须为空，禁止生成看似真实的 URL。

## 历史与上下文

每轮都从数据库按稳定顺序读取标准消息，不复用 Provider 线程作为事实来源。Provider response/thread ID 仅作为 metadata 保存。

上下文由以下部分组成：

1. 系统行为与金融风险提示。
2. Thread 绑定的股票身份。
3. 历史用户/助手消息及历史引用摘要。
4. 当前用户消息。
5. 工具定义。

模型切换不改变历史语义；各 Provider 适配器负责把标准消息翻译成自己的格式。

## AgentOrchestrator

一次运行最多 6 轮模型调用或工具循环，总时限 90 秒。流程为：

1. 校验 Thread、消息与指定模型。
2. 加载标准历史。
3. 调用指定 Provider。
4. 无工具调用时返回最终结果。
5. 有工具调用时校验参数、顺序执行并记录结果，再继续下一轮。
6. 达到轮次或时间上限时以明确错误结束，不生成伪完成消息。

同一模型响应中的多个只读数据库工具可以后续优化为并行；首版顺序执行，确保阶段、审计和超时行为确定。

## 输出与持久化边界

编排器返回 `AgentTurnResult` 和工具执行记录，不直接决定 Worker 锁或 Realtime。为便于本批验收，可由测试专用 service 在事务中保存助手消息与 Tool Call；不得新增绕过鉴权的公开调试接口。

工具错误分为参数错误、权限/资源错误、临时外部错误和内部错误。单个可解释工具错误可作为 tool result 交回模型；数据库越权、取消信号和总超时立即终止 Run。

## 测试与完成条件

- 每个工具覆盖所有权过滤、数量上限、稳定排序与空结果。
- Tavily 覆盖 URL 去重、超时、无结果、恶意指令文本和引用映射。
- 编排器覆盖无工具回答、单工具、多轮工具、非法工具、非法参数、6 轮上限、90 秒超时和取消。
- 覆盖同一 Thread 连续使用 DeepSeek、OpenAI、MiniMax 时历史保持一致。
- 验证搜索失败提示和零伪造引用。
- 专项测试、`pnpm validate` 与 `pnpm build:server` 通过。

