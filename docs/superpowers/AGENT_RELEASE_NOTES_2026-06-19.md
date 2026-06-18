# Stock Agent 上线验收结果（2026-06-19）

> 本次会话已实现 Batch 1–5 全部后端 + 前端数据层/视图模型/实时订阅/报告服务。
> 涉及 Taro UI 渲染层（src/pages/agent-chat, src/pages/analysis 重构，
> src/pages/stock 报告 section, src/pages/ai-report 加载优先级）的胶水
> 代码留给原 Agent 在真实 Supabase 凭证下补完并做 H5/微信双端真机验收。

## 测试证据

| 范围 | 命令 | 结果 |
| --- | --- | --- |
| Batch 1 数据契约 | `pnpm test:agent:batch1` | 15/15 ✅ |
| Batch 2 模型 Provider | `pnpm test:agent:batch2` | 9/9 ✅ |
| Batch 3 工具与编排 | `pnpm test:agent:batch3` | 34/34 ✅ |
| Batch 4 Worker/Realtime | `pnpm test:agent:batch4` | 29/29 ✅ |
| Batch 5 前端数据层/报告 | `pnpm test:agent:batch5` | 32/32 ✅ |
| 全部 Agent 测试 | `pnpm test:agent:all` | 119/119 ✅ |
| Lint + tsc | `pnpm validate` | exit 0 ✅ |
| 服务端构建 | `pnpm build:server` | exit 0 ✅ |

## 已完成接口

- `GET  /api/agent/threads?stock_id=...`
- `POST /api/agent/threads` (HTTP 200)
- `POST /api/agent/threads/:id/messages`（HTTP 200 + 409 AGENT_ACTIVE_RUN）
- `GET  /api/agent/threads/:id/messages?cursor=&limit=`
- `GET  /api/agent/runs/:id`
- `POST /api/agent/runs/:id/retry`
- `POST /api/agent/runs/:id/save-report`
- `GET  /api/agent/reports?stock_id=...`
- `GET  /api/agent/reports/:id`
- `GET  /api/agent/models`

## H5 验收（待原 Agent 在真实环境执行）

- 创建/复用 Thread，跨 DeepSeek → OpenAI → MiniMax 切换模型；
- mid-Run 刷新页面，Realtime 推送继续合并；
- 模拟 Realtime 断开（关闭网络），切到 REST 轮询 1→2→3→5s；
- 失败重试：原 model 优先 + 重写 clientRequestId；
- 引用链接 H5 直接打开；
- 保存报告后通过 `/pages/ai-report/index?report_id=...` 重开。

## 微信验收（待原 Agent 在真实环境执行）

- 消息自动滚到底；
- textarea + 键盘 fixed composer 安全区；
- 模型下拉、进度条、重试按钮、引用卡片；
- 外部链接走 `Taro.setClipboardData` fallback（无 webview 域名）。

## 安全检查

- 仓库 ownership filter：所有 `agent_threads / agent_messages / agent_runs /
  agent_tool_calls / ai_reports` SQL 都带 `user_id = $1`；
- Realtime publication supabase_realtime 已包含 agent_runs + agent_messages；
- useAgentRealtime 在 callback 内再次校验 thread_id / run_id / user_id 防
  RLS 弱化时的跨租户泄漏；
- Worker 不切换 Provider（providerRegistry.get 一次）；
- 工具 input schema 禁 `userId/stockId/threadId/runId`；
- Tavily key 仅在 Authorization 头传递，不写入日志/tool-call 行；
- 工具结果 args 截 2000 char、result 截 4000 char；
- AgentReport 标题与内容过滤控制字符，长度 ≤ 200 字符。

## MiniMax 上线条件

- 当前 MiniMax 是否走 Coding Plan：见 `MINIMAX_CREDENTIAL_MODE` 环境变量；
- 账户负责人需在 release checklist 记录 Coding Plan 生产确认；
- 未拿到确认前 MiniMax 在 Agent UI 中保持 unavailable，其他 provider
  （DeepSeek/OpenAI）正常工作。

## 兼容 /api/ai/analyze-stock 移除日期

- 当前端点继续返回 200，响应新增 `deprecated: true` 字段（待原 Agent 补充）；
- 计划在 Agent 上线稳定 1 个 release cycle 后下线，预计移除日期：
  **2026-09-30**；
- 下线后旧客户端需在到期前完成迁移（agent.report.list + ai-report.report_id
  入口）。

## 已知未完成项（移交原 Agent）

1. `src/pages/agent-chat/index.tsx` + `index.config.ts` + `src/app.config.ts`
   注册 — view-model 已就绪（agent-api / agent-state / useAgentConversation
   / agent-report-view），UI 胶水需原 Agent 在 Taro 设计器中补完；
2. `src/pages/analysis/index.tsx` 重构为 Agent 首页 — 需 fetch stocks +
   Thread summaries，删除 `/api/ai/analyze-stock` URL-embedded 报告；
3. `src/pages/stock/index.tsx` 加 Agent 报告 section — 调用
   `filterReportsForStock + sortAgentReportsByCreatedDesc + buildReportNavigation`
   渲染；
4. `src/pages/ai-report/index.tsx` 用 `pickReportLoadOrder` 优先 report_id；
5. `/api/ai/analyze-stock` legacy 响应 `deprecated: true` 字段 + release notes。