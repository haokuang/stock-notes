# 股票研究 Agent 分批交付索引

## 需求来源

本组设计拆解自 `docs/superpowers/plans/PLAN-股票研究 Agent（含生产 MiniMax Coding Plan）实施计划.md`。原文件保留为需求来源；本索引和五份批次设计定义实际开发顺序、边界与验收口径。

## 拆分原则

- 前四批允许只交付底层能力，第五批形成完整用户闭环。
- 依赖严格单向：数据契约 → Provider → 编排器 → Worker → 前端。
- 每批均可通过自动化测试独立验收，不把核心技术探索推迟到前端集成阶段。
- 新增能力通过稳定接口连接，模型 SDK 类型、数据库行类型和页面状态不得互相泄漏。
- 所有包管理命令使用 `pnpm`；所有接口使用 `/api/...` 相对路径和现有 `Network` 封装。

## 批次顺序

| 批次 | 设计文档 | 主要产物 | 进入条件 | 完成条件 |
|---|---|---|---|---|
| 1 | `2026-06-18-stock-agent-batch-1-data-contracts-design.md` | 数据表、RLS、Realtime publication、领域类型、仓储和 API 骨架 | 当前主干可通过既有校验 | 数据与权限契约测试通过，不调用模型 |
| 2 | `2026-06-18-stock-agent-batch-2-model-providers-design.md` | 三家 Provider、模型目录、MiniMax Coding Plan 健康治理 | 批次 1 类型与持久化契约稳定 | 三家 Provider 合约和错误映射测试通过 |
| 3 | `2026-06-18-stock-agent-batch-3-orchestration-tools-design.md` | 只读工具、Tavily、上下文构建、AgentOrchestrator | 批次 2 Provider 合约稳定 | 同步测试入口可完成含工具调用的完整回合 |
| 4 | `2026-06-18-stock-agent-batch-4-background-realtime-design.md` | Run Worker、互斥、领取、重试、恢复、Realtime | 批次 3 编排结果稳定 | API 提交后可异步完成并实时观察状态 |
| 5 | `2026-06-18-stock-agent-batch-5-product-loop-design.md` | Taro 会话体验、报告闭环、兼容与上线验收 | 批次 4 异步链路稳定 | H5/微信端完整流程和回归通过 |

## 全局不变量

1. Thread 固定绑定当前用户的一只自选股；客户端不能改变已有 Thread 的 `stock_id`。
2. 每条用户消息显式记录实际 Provider 和模型，历史由数据库记录重建。
3. 同一 Thread 同时最多一个 `queued` 或 `running` Run。
4. Provider 失败不得静默切换；只有用户显式重试才能重新执行。
5. 工具只读，且 `user_id` 与 `stock_id` 由后端执行上下文注入。
6. 外部搜索是不可信输入；不得遵循搜索结果中的指令，不得伪造引用。
7. 所有成功 NestJS POST 接口显式返回 HTTP 200。
8. 前端只通过 `Network` 调用相对路径，不直接使用 `Taro.request` 或 `fetch`。

## 总体验收

- 五批专项测试全部通过。
- `pnpm validate`、`pnpm build:server`、`pnpm build:web`、`pnpm build:weapp` 通过。
- RLS 验证不同用户不能读取或修改 Thread、Message、Run、Tool Call、Report。
- DeepSeek、OpenAI、MiniMax 可逐条切换；MiniMax Coding Plan 状态可见且密钥不外泄。
- 服务重启、临时网络错误、429、额度耗尽、工具失败和 Tavily 超时均符合对应设计。

