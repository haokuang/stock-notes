# 股票研究 Agent 批次 2：模型 Provider 与可用性治理设计

## 目标

为 DeepSeek、OpenAI、MiniMax 提供统一、可测试的模型调用边界，并让 MiniMax Coding Plan 在开发与生产环境使用相同的显式配置和健康治理规则。

## 依赖与范围

依赖批次 1 的 `AgentProvider`、消息和 Run 契约。本批包含 Provider 接口、三家适配器、配置校验、模型目录、健康检查、限流状态与标准错误；不包含工具执行、历史上下文装配、Worker 和页面。

## Provider 边界

```ts
interface AgentModelProvider {
  readonly provider: AgentProvider
  generate(request: AgentProviderRequest): Promise<AgentTurnResult>
  checkHealth(): Promise<ProviderHealth>
}
```

`AgentProviderRequest` 只包含标准消息、模型名、可选工具定义、超时信号和追踪 ID。`AgentTurnResult` 只包含正文、标准工具调用、标准引用和 `providerMetadata`。OpenAI、DeepSeek、MiniMax SDK 的 response、message、tool-call 类型不能越过适配器边界。

Provider 注册表按 `AgentProvider` 查找实现；未知 Provider 或未配置模型在调用前失败。不得在注册表内实现回退链。

## 配置规则

支持原规划中的环境变量，并新增启动时结构化校验：

- DeepSeek：API key、base URL、默认模型。
- OpenAI：API key、默认模型。
- MiniMax：`MINIMAX_CREDENTIAL_MODE=api|coding_plan` 决定只读取对应凭据；未选中的密钥不得参与日志或响应。
- `AGENT_*_MODEL` 是服务允许模型目录的默认项，客户端不能提交任意未登记模型。

生产环境允许 `coding_plan`，不根据 `NODE_ENV` 禁用。条款确认属于上线门禁，不由代码猜测或自动绕过。

## MiniMax 健康治理

- 应用启动后异步执行鉴权与最小模型健康检查，不阻塞 NestJS 整体启动。
- 状态包括 `checking | available | unavailable | rate_limited`。
- 保存最后成功时间、失败原因分类和 `retryAfter`；不保存或返回密钥。
- 401/403 标记不可用；429 标记临时限流；额度耗尽标记不可用并给出可读原因。
- 健康检查恢复成功后清除临时错误。

DeepSeek 和 OpenAI 使用同一健康结构，但首版只要求 MiniMax 启动主动检查；其他 Provider 可在首次调用或显式刷新时更新状态。

## 模型目录 API

`GET /api/agent/models` 返回允许当前服务使用的模型：

```ts
type AgentModelOption = {
  provider: AgentProvider
  model: string
  label: string
  available: boolean
  credentialMode?: 'api' | 'coding_plan'
  unavailableReason?: string
  retryAfter?: number
}
```

API 不返回 base URL、密钥、原始上游错误体或账号信息。未配置 Provider 仍可返回 `available: false`，让前端解释不可用原因。

## 错误模型

统一错误码：

- `PROVIDER_AUTH_FAILED`
- `PROVIDER_QUOTA_EXHAUSTED`
- `PROVIDER_RATE_LIMITED`
- `PROVIDER_INVALID_REQUEST`
- `PROVIDER_TIMEOUT`
- `PROVIDER_TEMPORARY_FAILURE`
- `PROVIDER_UNAVAILABLE`

错误对象包含 `retryable`、安全的用户提示和可选 `retryAfter`。只有超时、临时网络与明确可恢复的 5xx 标记为可重试；401、403、额度耗尽和参数错误不可重试。日志可记录上游请求 ID，但不得记录 prompt、密钥或完整上游错误体。

## 测试与完成条件

- 共享合约测试以同一组 fixture 验证三家适配器的文本、工具调用和 metadata 映射。
- 使用 HTTP/SDK mock 覆盖成功、401、403、429、额度耗尽、5xx、超时和中止信号。
- 覆盖 MiniMax `api` 与 `coding_plan` 在 development/production 的配置矩阵。
- 验证一次 Provider 失败不会调用其他 Provider。
- 模型目录快照不包含敏感字段。
- `pnpm validate`、Provider 专项测试和 `pnpm build:server` 通过。

