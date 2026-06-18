# 股票研究 Agent 批次 5：前端闭环与上线加固设计

## 目标

把前四批能力接入 Taro H5 与微信小程序，交付选择股票、进入会话、逐条选择模型、查看实时进度、处理失败、保存正式报告和回看报告的完整闭环。

## 页面与导航

### AI 分析首页

复用 `src/pages/analysis/index.tsx` 路由，将现有 Mock 分析入口改为 Agent 会话首页：

- 展示自选股列表及最近会话摘要。
- 点击股票时幂等获取或创建 Thread，再进入股票对话页。
- 保留单图解读入口，不改变其既有 API。
- 使用现有 `Card`、`Button`、`Badge`、`Skeleton` 等 `@/components/ui` 组件，不用 View/Text 手搓通用组件。

### 股票对话页

新增 `src/pages/agent-chat/index.tsx` 与页面配置：

- 顶部展示固定股票身份。
- 消息列表加载历史并支持游标分页。
- 输入区域使用 UI `Textarea`、`Select`、`Button`。
- 每次发送显式携带 Provider 和模型；选择只影响下一条消息。
- Run 活动期间禁用重复发送，展示阶段文案。
- 用户消息提交成功后立即保留；失败 Run 下展示错误和“使用原模型重试”。
- MiniMax 选项显示“Coding Plan”或“正式 API”，不可用项解释原因。

Fixed + Flex 输入栏按项目跨端规则使用必要的内联布局兼容，并避开 TabBar/安全区；其余颜色、间距、圆角和排版使用 Tailwind 预设类。

### 报告页与股票详情

- `POST /api/agent/runs/:id/save-report` 只接受已完成且属于当前用户的 Run。
- 报告正文取该 Run 的最终助手消息，事务内幂等创建 `ai_reports`。
- 保存成功后可打开 `/pages/ai-report/index?report_id=...`。
- 报告页以 `report_id` 为主加载方式，保留旧 `report`、`brief`、`stock_id` 参数一个兼容周期。
- 股票详情页增加该股 Agent 报告列表或最近报告入口。

## 前端状态与数据解包

新增独立逻辑模块管理：模型目录、Thread、分页消息、活动 Run、Realtime 合并和 REST 补偿。页面组件只负责渲染和事件。

每次新接口接入先记录 `console.log(res.data)` 验证 envelope，再通过明确的 `ApiResponse<T>` 解包。不得把 `res.data` 直接断言为业务对象。

Realtime 事件按 ID upsert，防止初始 REST 加载与实时事件重复。页面显示时恢复活动 Run；隐藏或卸载时取消 channel。Realtime 不可用时采用有上限的 REST 轮询作为降级，并在终态停止。

## 阶段与错误体验

阶段文案：

- `queued`：等待开始
- `loading_context`：正在读取股票资料
- `calling_tools`：正在整理本地研究资料
- `searching`：正在检索相关新闻
- `generating`：正在生成回答

错误按后端安全错误码映射：鉴权配置、额度耗尽、限流、临时网络、超时和通用失败。429 展示可重试时间；任何失败都保留用户消息，不自动切换 Provider。

搜索失败但模型完成时，在回答附近明确显示“联网资料获取失败”；引用存在时展示标题、来源、发布时间和可打开 URL。不得渲染模型生成但后端未验证的引用。

## 旧接口兼容与发布门禁

- `/api/ai/analyze-stock` 保留一个版本周期，可返回迁移提示或继续旧行为，但不调用新 Agent 内部私有方法形成双写。
- 新页面不再调用旧接口。
- MiniMax Coding Plan 的生产启用需要账号持有人在发布清单中确认条款；未确认时生产配置保持不可用，但不影响其他 Provider。
- 日志和错误监控确认不包含用户完整消息、密钥、Provider 原始响应和搜索全文。

## 跨端与组件规范

- 通用按钮、输入、选择器、卡片、标签、提示、骨架屏必须优先使用 `@/components/ui`。
- Taro `Text` 垂直排列时添加 `block`。
- 图标使用 `lucide-react-taro` 的 `color`、`size`、`strokeWidth`。
- 不新增本地图片或占位图片；本批不需要新增媒体资源。
- 网络请求全部使用 `Network` 与 `/api/...` 相对路径。
- 平台判断直接使用 `Taro.getEnv()`，不通过异步 state 推断。

## 测试与完成条件

- 纯逻辑测试覆盖 envelope 解包、消息去重、阶段映射、错误映射、活动 Run 恢复和轮询停止。
- 页面测试或可控 mock 验证模型不可用、发送互斥、失败保留、原模型重试、引用展示和报告幂等保存。
- H5 手工验收完整会话、刷新恢复、Realtime 断线恢复和报告回看。
- 微信小程序验收输入栏、滚动、模型切换、阶段更新、外链降级和安全区。
- 验证股票详情仅展示当前用户、当前股票的报告。
- 执行 `pnpm validate`、全部 Agent 测试、`pnpm build:server`、`pnpm build:web` 和 `pnpm build:weapp`。
- 原规划 Test Plan 中的 Provider、MiniMax、切换模型、工具、权限、Worker、引用、Realtime、报告和跨端项目全部有通过证据。

