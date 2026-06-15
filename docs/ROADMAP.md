# Stock Notes · 功能开发总账

> 用表格管理"什么已开发 / 什么没开发 / 优先级如何",避免方向偏差。
>
> **状态图例**:✅ 已完成 / 🚧 部分完成 / ⏳ 待开发 / ❌ 已砍
> **优先级**:P0 不做不能上线 / P1 上线后第一个迭代 / P2 锦上添花 / P3 长期愿景
>
> 上次更新:2026-06-15

---

## 零、上线前修复队列

> 以下任务按顺序处理。前一项通过验收后再进入下一项，避免多条核心链路同时处于半完成状态。

| 顺序 | 任务 | 优先级 | 状态 | 验收标准 |
|---|---|---|---|---|
| 1 | 修复后端编译 | P0 | ✅ 2026-06-15 | `pnpm build:server` 成功，根目录 `pnpm build` 不再因服务端 TypeScript 错误中断 |
| 2 | 修复 Git 断链 | P0 | ✅ 2026-06-15 | 生产代码引用的 helper 与专项测试全部纳入 Git；全新检出后 `pnpm test:note-editor`、`pnpm validate` 可直接运行 |
| 3 | 修复编辑笔记数据丢失 | P0 | ✅ 2026-06-15 | 编辑已有笔记时保留方向、入场价、目标价、止损价、标签和图片；更新请求只发送页面实际编辑或明确传入的字段 |
| 4 | 修复每日简评重复写入 | P0 | ✅ 2026-06-15 | `0006_daily_brief_upsert.sql` 已应用；唯一键包含用户维度，简评与自动笔记在同一短事务内执行 upsert |
| 5 | 打通图片上传与 AI 协议 | P1 | 🚧 下一版优化 | 已完成后端接收图片、TOS 上传和视觉模型协议；真实凭据配置、跨端上传验收和结果落笔记放到下一版 |
| 6 | 实现登录令牌自动续期 | P0 | ✅ 2026-06-15 | access token 过期时使用 refresh token 单次续期并重放原请求；并发 401 共享同一次刷新，续期失败才清理 session 并跳转登录 |
| 7 | 修复筛选与页面跳转断链 | P0 | ✅ 2026-06-15 | 观点库筛选会重新加载；热力图对象格式和日期边界正确；搜索模式切换、AI 报告 GET/解包及文档入口参数已修复 |
| 8 | 接入 A 股普通股票真实搜索 | P0 | ✅ 2026-06-15 | 仅返回沪深北上市普通 A 股；支持股票代码和名称搜索；添加时以后端 Tushare 主数据为准，拒绝任意文本、B 股、ETF、指数和无效代码 |
| 9 | 修复 Supabase Realtime 用户鉴权 | P0 | ✅ 2026-06-15 | Supabase 客户端通过 `accessToken` 回调读取应用 session，登录、续期、退出时再用 `realtime.setAuth` 即时同步；已用测试账号在 RLS + `stock_id` 过滤下完成真实事件验收 |
| 10 | 修复数据库模型与真实 Schema 漂移 | P0 | ⏳ 待开发 | Drizzle 中 `stop_loss_triggered` 与真实 boolean 类型一致；补齐股票及日线唯一索引声明和迁移；重复添加同一股票由数据库约束兜底 |
| 11 | 买入 / 卖出改为原子事务 | P0 | ⏳ 待开发 | 股票状态更新与买卖笔记写入必须同时成功；任一步失败全部回滚；并发行锁避免重复买入或重复卖出 |
| 12 | 自动补齐技术指标 60 个交易日 | P0 | ⏳ 待开发 | 生成简评前先读取数据库；不足 60 条时从 Tushare 拉取约 120 个自然日并 upsert，再从数据库读取最近 60 条计算；停牌或次新股使用实际可获得样本并记录样本数 |

---

## 一、基础设施

| 功能 | 优先级 | 状态 | 完成日期 | 详细说明 |
|---|---|---|---|---|
| Supabase 集成 | P0 | ✅ | 2026-06-14 | 后端直连 Postgres + 前端 Realtime 订阅架构 |
| Supabase Auth + RLS | P0 | ✅ | 2026-06-14 | 邮箱注册/登录,4 张业务表 16 条 RLS 策略,FK 引用 `auth.users` |
| JWT 全局鉴权 | P0 | ✅ | 2026-06-14 | `JwtGuard` 全局拦截 + `@Public()` 放行,前端自动注入 Bearer 头 |
| Drizzle ORM + pg 直连 | P0 | ✅ | 2026-06-14 | `PG_POOL` + `client.query()` 混合模式,绕开 Drizzle 0.45 的 prepared-stmt 错误吞掉 bug |
| Tushare 真实日线 fallback | P0 | ✅ | 2026-06-14 | `refreshPrice` 内已实现:腾讯失败 → Tushare daily(最近 1 天)→ 旧快照 |
| 错误监控 + 告警 | P0 | ✅ | 2026-06-14 | `migrations/0005_error_logs` + `GlobalExceptionFilter`(5xx 落库 + 邮件)+ `AlertService`(Resend 集成,无 API key 时降级 console)+ cron 失败告警;`RESEND_API_KEY` / `ALERT_EMAIL` env 留空即可纯落库 |
| 价格数据时间标签 | P0 | ✅ | 2026-06-14 | 后端返回 `price_time` + `is_realtime`;前端首页/详情页显示 `今日 14:30` / `今日收盘` / `昨日收盘` / `MM-DD`,非实时加灰色徽章 |
| Supabase Realtime 推送 | P0 | ✅ | 2026-06-15 | 已修复前端订阅 JWT 注入和续期同步；`stock_briefs` publication、RLS、带 `stock_id` 过滤的真实 INSERT 事件均已验收 |
| cron 走 Postgres 队列 | P1 | ⏳ | | 用 `pg_cron` 替代 NestJS 进程内 cron,服务重启不丢任务,半天 |

---

## 二、数据模型

| 功能 | 优先级 | 状态 | 完成日期 | 详细说明 |
|---|---|---|---|---|
| 4 张业务表(stocks / notes / stock_prices / ai_reports) | P0 | ✅ | 2026-06-13 | 见 `docs/SUPABASE.md` § 4 |
| stock_briefs 每日简评缓存表 | P0 | ✅ | 2026-06-15 | migrations/0003 建表；0006 补用户维度唯一键与幂等 upsert |
| 状态机字段(status / entry_price / loss_rate / entered_at) | P0 | ✅ | 2026-06-14 | migrations/0002 |
| stock_prices 唯一约束 | P0 | ✅ | 2026-06-14 | migrations/0004 补 `(user_id, stock_id, trade_date)` UNIQUE |
| stocks 用户股票唯一约束 | P0 | ⏳ | | 增加 `(user_id, code)` UNIQUE，服务层预检查只负责友好提示，数据库负责并发一致性 |
| Drizzle / 真实 Schema 一致性 | P0 | ⏳ | | `stock_briefs.stop_loss_triggered` 收回 boolean；将真实唯一索引同步到代码模型 |
| market_prices 全市场共享行情表 | ❌ | ⏳ | | **已砍** — 调研过方案,用户"前期不超 100 用户",不做共享 |

---

## 三、业务功能 — 状态机 / 记笔记

| 功能 | 优先级 | 状态 | 完成日期 | 详细说明 |
|---|---|---|---|---|
| CRUD:股票 / 笔记 | P0 | ✅ | 2026-06-13 | 增删改查 + 列表 + 搜索 |
| 买入三件套(entry_price / buy_reason / loss_rate) | P0 | ✅ | 2026-06-14 | `POST /:id/buy`,watching → holding,落 note tags=['buy'] |
| 卖出(回 watching + 落 note) | P0 | ✅ | 2026-06-14 | `POST /:id/sell` |
| 买入 / 卖出原子事务 | P0 | ⏳ | | 状态更新与买卖笔记写入放入同一数据库事务，并通过 `SELECT ... FOR UPDATE` 串行化同一股票的并发操作 |
| 止损 4 档(ok / warning / danger / triggered) | P0 | ✅ | 2026-06-14 | 基于 `loss_rate` 百分比 |
| "形成投资判断" 节点 | ❌ | ⏳ | | **已砍** — 用户:"不需要产品替用户判断" |
| "买点出现" 信号 | ❌ | ⏳ | | **已砍** — 同上 |
| 减仓 / 加仓 / 调仓状态 | P3 | ⏳ | | 复杂状态机,飞书流程图里没 |
| buy_reason 独立字段(stocks 表) | P1 | ⏳ | | 现在散落在 note.content,半天 |
| 止盈 / 预警多价位 | P2 | ⏳ | | 1 天 |
| **PDF 研报 / 财报上传 + MD 解析** | **P1** | ⏳ | | 选 **Supabase Storage**(RLS 跟 auth 一致、SDK 直传免后端代理);5-10MB PDF 走 `pdf-parse` 转 MD,notes 表加 `doc_pdf_url` / `doc_pdf_size` / `doc_pdf_pages` 字段,MVP 半天(同步解析,后续可改异步) |
| **笔记图片 OCR(截图识别)** | **P1** | 🚧 | | 单图上传与视觉模型协议已完成，图片按项目规范存 TOS；待部署环境补齐 TOS/视觉模型凭据后完成真实链路验收，再把结果落 `notes.ai_summary` 或新增 `image_ocr` 字段 |

---

## 四、业务功能 — 行情与简评

| 功能 | 优先级 | 状态 | 完成日期 | 详细说明 |
|---|---|---|---|---|
| 腾讯实时价格接口(qt.gtimg.cn) | P0 | ✅ | 2026-06-14 | 后端 `getRealtimeQuote` 调腾讯 |
| 手动刷新价格(1 分钟限频) | P0 | ✅ | 2026-06-14 | 服务端 token bucket + 前端倒计时 |
| 生成今日简评按钮 | P0 | ✅ | 2026-06-15 | silent 先刷价再跑简评；同一交易日重复生成覆盖原简评与自动笔记 |
| 每日简评 3 段结构化输出 | P0 | ❌ | 2026-06-14 | **重构成 100 字单段简评** + LLM 同步判色(green/yellow/red)，每用户/股票/交易日保留 1 条并同步更新自动 doc 笔记 |
| 3 色信号 + 证据链 | P0 | ✅ | 2026-06-14 | 3 色保留(LLM 判色替代了原 action→signal 映射),证据链字段 `evidence_note_ids` / `sell_reasons` 留作未来扩展,前端已不展示 |
| cron 15:35 自动跑简评 | P0 | ✅ | 2026-06-14 | 只对 holding 跑,止损强覆盖 red |
| 技术指标历史自动补齐 | P0 | ⏳ | | 数据库不足 60 个交易日时拉取约 120 个自然日并 upsert；补齐后统一从数据库读取，避免每次重复请求 |
| 简评证据列表弹窗 | P2 | ⏳ | | 现在只弹第一个,2 小时 |
| price 分时图 / 分钟 K 线 | P2 | ⏳ | | Taro Canvas + F2,1 周 |
| 腾讯 source 字段名修正(eastmoney → tencent) | P2 | ✅ | 2026-06-14 | 合并到"价格数据时间标签"任务,字符串已改完 |

---

## 五、前端页面

| 功能 | 优先级 | 状态 | 完成日期 | 详细说明 |
|---|---|---|---|---|
| 首页(自选股 + 最近观点) | P0 | ✅ | 2026-06-14 | 状态徽章 + 止损红点 |
| 股票详情(状态 + 三件套 + 止损条 + 简评时间线) | P0 | ✅ | 2026-06-14 | 含 3 色时间线 + 证据 |
| 买入表单(三件套 + 止损价预览) | P0 | ✅ | 2026-06-14 | `/pages/buy/index` |
| 登录 / 注册(玻璃拟态) | P0 | ✅ | 2026-06-14 | `/pages/login/index` |
| 观点库(全部 / 看多 / 看空 / 中性) | P0 | ✅ | 2026-06-13 | |
| AI 分析中心(单图 / 跨观点) | P1 | 🚧 | | 页面和协议已具备；跨观点报告仍为占位结果，真实模型分析与报告持久化放到下一版 |
| 我的(统计 + 设置 + 登出) | P0 | ✅ | 2026-06-13 | |
| 添加股票 / 笔记编辑 / 笔记详情 / AI 报告 / 单图解读 / 搜索 / heatmap 详情 | P0 | ✅ | 2026-06-13 | 7 个原有页面 |
| A 股普通股票搜索与添加 | P0 | ✅ | 2026-06-15 | 已替换 6 条静态热门数据；搜索结果来自 Tushare 上市股票主数据，添加接口会再次精确校验 |
| 首页持仓实时小红点(Realtime 推送) | P1 | 🚧 | | 本轮先修复简评 Realtime 鉴权；首页 `stocks` 更新订阅仍作为后续体验优化 |
| 简评证据列表弹窗 | P2 | ⏳ | | 见 § 四 |
| 观点库 tag 筛选 + 全文搜索 | P1 | ⏳ | | 1 天 |
| AI 报告列表页(`/ai-report-list`) | P1 | ⏳ | | 半天 |

---

## 六、推送与通知

| 功能 | 优先级 | 状态 | 完成日期 | 详细说明 |
|---|---|---|---|---|
| 浏览器原生 Notification(详情页 red brief 弹窗) | P1 | 🚧 | | hook 写好；本轮修复 Realtime 鉴权，通知权限设置页仍放下一版 |
| Supabase Realtime 推送 | P0 | ✅ | 2026-06-15 | 见 § 一 Realtime 行 |
| 首页持仓实时小红点 | P1 | 🚧 | | 见 § 五 |
| 微信 / 抖音小程序推送 | P2 | ⏳ | | `wx.requestSubscribeMessage` + 服务端 `subscribeMessage.send`,1 周 |
| 邮件每日摘要(17:00 推) | P2 | ⏳ | | Resend / SendGrid,3 天 |
| Web Push + PWA | P2 | ⏳ | | HTTPS + service worker + VAPID,1 周 |
| 多用户协作(共享 watchlist / notes) | P3 | ⏳ | | 角色权限,3 周+ |
| AI 投研长报告(深度分析) | P3 | ⏳ | | 引用 10+ 历史观点 + 行业数据,2 周 |
| 股票池社区推荐 / 关注榜 | P3 | ⏳ | | 类似雪球,2 周 |

---

## 七、质量与维护

| 功能 | 优先级 | 状态 | 完成日期 | 详细说明 |
|---|---|---|---|---|
| 错误监控 + 告警 | P0 | ✅ | 2026-06-14 | 见 § 一 |
| useStockRefresh 单元测试 | P2 | ⏳ | | vitest + jsdom,半天 |
| Coze SDK 完全移除 | P2 | ⏳ | | `coze-coding-dev-sdk` 装但代码已不用,1 天 |
| 跑 pnpm validate 不通过项修复 | 持续 | ✅ | 2026-06-14 | lint + tsc 全过 |

---

## 八、文档

| 功能 | 优先级 | 状态 | 完成日期 | 详细说明 |
|---|---|---|---|---|
| README.md 增补新文档链接 | P0 | ✅ | 2026-06-14 | |
| docs/SUPABASE.md(11 节) | P0 | ✅ | 2026-06-13 | Supabase 接入指南 |
| docs/STATE_MACHINE.md | P0 | ✅ | 2026-06-14 | 状态机 / 3 色 / 止损规则 |
| docs/ROADMAP.md(本文档) | P0 | ✅ | 2026-06-14 | 功能总账 |

---

## 已砍 ❌

| 功能 | 砍的日期 | 原因 |
|---|---|---|
| "形成投资判断" 节点 | 2026-06-14 | 用户:"不需要产品替用户做判断" |
| "买点出现" 信号 | 2026-06-14 | 同上 |
| Coze DB 备份方案 | 2026-06-14 | 用户:"放弃 Coze backup" |
| 全市场行情共享(`market_prices` 表) | 2026-06-14 | 用户:"前期不超 100 用户,不做共享" |
| 价格数据源可切换(`STOCK_DATA_SOURCE`) | 2026-06-14 | 过度设计 — `refreshPrice` 已有腾讯→Tushare 自动降级;`daily-sync` 主动选 Tushare 是稳定来源;`eastmoney` 选项从不存在 |
| Tushare 频次限频改造(批量 daily) | 2026-06-14 | 无真实信号 — 100 用户 × 10 只 × 1 sync/天 = 1000 次,远低于 Tushare 8000/天限制;等真实出现 429 或用户量超 200 再启动 |
| 历史回填脚本(1 年真实日线) | 2026-06-14 | 无真实需求 — 暂无"看 1 年 K 线"产品功能依赖;等用户主动问再看 |

---

## 历史变更

| 日期 | 变更 |
|---|---|
| 2026-06-14 | 文档初版 — 基于今天全部对话 + 飞书 3 版流程图梳理 |
| 2026-06-14 | 确认 Tushare 真实日线 fallback 已实现(腾讯失败 → Tushare daily → 旧快照) |
| 2026-06-14 | 新增"价格数据时间标签"P0:后端 `refreshPrice` 返回 `price_time` + `is_realtime`;前端首页/详情页展示 `今日 14:30` / `今日收盘` / `昨日收盘` / `MM-DD`;非实时加灰色徽章 |
| 2026-06-14 | 修复 `source` 字段名 `'eastmoney'` → `'tencent'`(实际数据来源是腾讯 qt.gtimg.cn) |
| 2026-06-14 | 砍掉"价格数据源可切换"P0 — 过度设计,`refreshPrice` 已有自动降级 |
| 2026-06-14 | 砍掉"Tushare 频次限频改造"P2 — 无真实信号,100 用户级别远低于配额 |
| 2026-06-14 | 砍掉"历史回填脚本"P2 — 无真实需求,等用户主动要看 1 年 K 线再启动 |
| 2026-06-14 | 升级"PDF 上传"到 **P1**,存储选 **Supabase Storage**(理由:RLS 跟 auth 一致,SDK 直传免后端代理,5-10MB PDF 在 50MB 单文件限制内,免费档 1GB 紧 100 用户级别需升 Pro);原"外部研报 PDF 上传 + OCR"TOS 描述已过时 |
| 2026-06-14 | 新增"笔记图片 OCR"P1 — 截图存 Supabase Storage,后端调 **Minimax coding plan** vision 模型,落 `ai_summary` 或新建 `image_ocr` 字段 |
| 2026-06-14 | 完成 P0 错误监控 + 告警 — `migrations/0005_error_logs` + `GlobalExceptionFilter` + `AlertService`(Resend,无 key 降级 console)+ cron 失败告警。已用 `/api/debug/boom` 端到端验证落库链路 |
| 2026-06-14 | 改名"投研观点" → "投研笔记"(登录页 + app.config 导航栏) |
| 2026-06-14 | 修登录页密码输入框 — 改用项目 UI Input 组件,避免 H5 上 `password` boolean prop 渲染异常;提示文字 11px → 13px |
| 2026-06-14 | ROADMAP 结构调整:把"PDF 研报上传"和"笔记图片 OCR"从 § 六(推送与通知)挪到 § 三(业务功能 — 状态机 / 记笔记),它们属于"记笔记"业务功能,不属于推送 |
| 2026-06-14 | 修**腾讯价格除 100 bug** — `tushare.service.ts` 的 `parsePrice` 错误地 `n/100`,导致页面显示 12.92(应是 1291.91);改用 `Number()` 直接取,废弃 `parsePrice`。同时 SQL 修正存量数据 `stocks` × 1 条 / `stock_prices` × 1 条 |
| 2026-06-14 | 股票详情页 review:删冗余"贵"头像 + 整体字号升级(`text-[10/11/12px]` → `text-xs/text-sm`)|
| 2026-06-15 | 每日简评改为幂等写入：`stock_briefs` 与自动 doc 笔记在同一短事务内 upsert，每用户/股票/交易日保留 1 条 |
| 2026-06-15 | 上线前修复队列继续推进：完成 refresh token 单飞续期与 401 重放；修复观点库筛选、热力图格式/日期、搜索模式、AI 报告和文档入口；图片上传与识图已移除 mock，本地环境待补 TOS/视觉模型凭据验收 |
| 2026-06-15 | 重新核查上线范围：AI 分析主入口与图片视觉真实验收调整为 P1；新增 A 股普通股票真实搜索、Realtime 用户鉴权、数据库模型一致性、买卖原子事务、技术指标 60 交易日自动补齐 5 项 P0，并按此顺序开发 |
| 2026-06-15 | 完成 A 股普通股票真实搜索：新增 `/api/stocks/search`、6 小时主数据缓存和沪深北普通 A 股过滤；添加接口只接收 6 位代码并以后端主数据为准；前端移除静态列表及任意文本添加 |
| 2026-06-15 | 修复 Supabase Realtime 用户鉴权：客户端通过 `accessToken` 回调读取应用 session，并在登录、自动续期、退出时调用 `realtime.setAuth`；真实测试账号在 RLS 与 `stock_id` 过滤下成功收到 `stock_briefs` INSERT |
| 2026-06-14 | 重构每日简评:3 段结构化 → **100 字单段自然语言简评**,LLM 同步判 green/yellow/red,落 `stock_briefs` 表 + 自动落一条 doc 笔记(`tags=['daily-brief','auto']`) |
| 2026-06-14 | 详情页:刷新按钮冷却中置灰(去掉 00:06 倒计时文字 + 删"1 分钟内只能刷新一次"提示) + 买入按钮文案改为"我已买入" |
| 2026-06-14 | 修 stock_briefs insert 5xx — Drizzle 0.45 prepared-stmt 吞错,改用 `client.query()` raw SQL(同 `stocks.service.ts:439` 模式),`evidence_note_ids` 显式 `{}` 字符串 |
| 2026-06-14 | note-edit 价格点位:止损字段加 ¥/% 切换 pill,百分比模式输入 -2.5 表示入场跌 2.5%,下方实时换算 `≈ ¥1260.00 (-2.50%)`;提交时百分比 → 绝对价(后端 schema 不变) |
| 2026-06-14 | note-edit 修复 4 项:详细观点文本框容器 #F4F4F8 → #E8E8EE + Textarea 显式 backgroundColor + padding:0;删"支持 AI 总结"chip;截图附件"添加截图" 10px → sm + ImageIcon 20 → 24 |
| 2026-06-14 | note-edit 4 项改动:① 删"来源"字段卡片(整块 + state + payload);② 标题留空时**AI 自动总结**(后端新接口 `POST /api/ai/summarize-title`,fallback 取 content 前 30 字,后续接 MiniMax coding plan 替换);③ 看多=红/看空=绿(中国习惯,note-edit 方向按钮 + 首页/观点库/截图解读 3 处方向徽章同步);④ 详细观点 textarea 用项目封装(项目封装容器改用浅灰底 #E8E8EE,允许调用方覆盖),minHeight 140→200,删 placeholderStyle;止损 ¥/% 切换 pill 字号 10px→12px(font-bold) |
| 2026-06-14 | 页面 `useDidShow` 自动 refetch 解决"添加股票后不刷新就不出现"问题:首页 / 我的 / 股票详情 3 个页面加 `useDidShow` 触发 reload,处理从 stock-add / buy 等子页面返回时的数据同步(轻量替代 Realtime 推送) |
| 2026-06-14 | **修"自选股没数据"根因**:① `create` 入库后**同步**调一次 `refreshPrice`(失败不阻塞,fallback 旧逻辑);② 首页涨跌 chip 数据缺失时显示灰色"未刷新"占位(避免 `▲ --` 假信号)。五粮液 000858 已用 SQL 补上 79.92 / +0.16% 演示数据 |
| 2026-06-14 | 修 doc 笔记空白:每日简评生成的 doc 笔记 `content` 包 `<p>...</p>` 让 `rich-text` 能渲染(note-detail 之前空白,因 rich-text 只渲染 HTML);SQL 回填已存在的 1 条 auto-brief 笔记;`doc_md` 仍存纯文本(markdown 源) |
| 2026-06-14 | note-detail rich-text fallback:Taro H5 上 `<rich-text>` 不稳定,改成直接用 `<Text>` 剥 HTML 标签后展示(`.replace(/<br\s*\/?>/gi, '\n')` + `.replace(/<[^>]+>/g, '')` + 实体还原) |
| 2026-06-14 | 澄清:简评**两种**触发 — ① cron 15:35 对所有 holding 自动跑(`daily-sync.service.ts:56`)② 用户点"生成今日简评"按钮(详情页)。"17:00 邮件摘要前完成"是不存在的约束(邮件摘要 P2 未实现),不影响当前频次论证 |
