# 股票状态机 · 产品规则

> 本文档集中描述股票状态机、3 色信号、止损规则,给后续接手的产品/设计/研发看。
> 实现细节见 `docs/SUPABASE.md`(数据库) 和 `server/migrations/`(迁移)。

## 1. 双状态模型

每只股票只有两种状态:

| 状态 | 含义 | 进入条件 | 退出条件 |
|---|---|---|---|
| `watching` | 观察中 | 新建股票默认 | 用户主动 `POST /buy` |
| `holding` | 持有中 | 用户填三件套后 | 用户主动 `POST /sell`(回到 watching) |

**不做** 减仓/加仓/止盈/调仓等中间态。简化模型,避免用户决策疲劳。

## 2. 进入持有 · 三件套

`POST /api/stocks/:id/buy`,body:

```json
{
  "entryPrice": 35.50,    // 买入价,必填 > 0
  "lossRate": 10,         // 亏损率上限(%),必填 0-100
  "buyReason": "突破年线,基本面+技术面共振"  // 必填 ≥ 10 字
}
```

后端校验:
- 股票存在 + 属于当前用户
- 当前状态必须是 `watching`
- 三件套字段全部合法

写入:
- `stocks.status='holding'`, `entry_price`, `loss_rate`, `entered_at=now`
- 新增一条 `note` 记录,`tags=['buy']`, `direction='bull'`, `content=buy_reason`,自动算 `stop_loss = entry_price * (1 - loss_rate/100)` 存进 note
- 股票状态与买入笔记在同一 PostgreSQL 事务中写入，并对该股票行加锁；任一步失败会整体回滚

## 3. 退出持有 · 卖出

`POST /api/stocks/:id/sell`,body:

```json
{ "exitReason": "止损线已触及" }  // 可选
```

后端校验:
- 状态必须是 `holding`
- 计算 `actual_return_pct = (current_price - entry_price) / entry_price * 100`

写入:
- `stocks.status='watching'`, 清空 entry_price/loss_rate/entered_at
- 新增一条 `note` 记录,`tags=['sell','exit']`, `direction='bear'`, `content=exitReason || "实际收益率 X%"`
- 股票状态与卖出笔记同样原子提交，避免出现“状态已卖出但卖出记录缺失”

## 4. 3 色每日简评

每日 15:35(交易日收盘后)cron 自动跑:

1. 同步 Tushare 行情(全用户所有股票)
2. 对所有 `status='holding'` 的股票,跑 `generateBrief(uid, stockId)`:

### 4.1 强止损覆盖(优先级最高)

```
if actual_loss_rate >= loss_rate:
    action = "sell"
    signal = "red"
    stop_loss_triggered = true
    reason = "亏损率达 X%,触及止损线 Y%"
```

不调 LLM,直接出结果,**比模型判断更准**。

### 4.2 LLM 生成(其余情况)

输入 prompt 包含:

| 维度 | 字段 |
|---|---|
| 股票信息 | 代码/名称/行业 |
| 持仓信息 | status / entry_price / loss_rate |
| **技术指标(本地算)** | MA5/20/60, MACD(DIF/DEA/HIST), RSI14, 布林带(20±2σ), 量比 |
| 技术指标样本 | 优先读取数据库最近 60 个交易日；不足时从 Tushare 拉取约 120 个自然日并批量 upsert，再重读数据库 |
| 今日行情 | 最新价/涨跌幅 |
| **买入理由** | 该股最近一条 `tags=['buy']` 的 note 内容 |
| 历史观点 | 最近 10 条 note 摘要 |
| 止损状态 | 友好文字提示 |

输出单段简评 JSON:

```json
{
  "content": "约 100 字的单段自然语言简评",
  "signal": "green"
}
```

`signal` 仅允许 `green` / `yellow` / `red`。持久化时为兼容旧表字段，分别映射到 `action=hold` / `review` / `sell`。

模型调用或 JSON 解析失败时回退到本地技术指标简评，`usedLLM=false`；`danger` 回退为黄灯，其他未触发止损状态回退为绿灯。

### 4.3 缓存

`stock_briefs` 表，`UNIQUE(user_id, stock_id, trade_date)` 防止同一用户同日重复，upsert 语义。

前端时间线:
- 详情页头部:最新 1 条单段 brief
- 详情页中部:最近 7 天 brief 时间线(3 色边框)
- 每条简评同步 upsert 一条 `tags=['daily-brief','auto']` 的 doc 笔记

## 5. 止损提醒(损失率阈值)

`loss_rate` 是用户输入的"最大可承受亏损百分比"。

### 5.1 4 档状态

| 状态 | 触发条件(actual_rate) | UI 颜色 |
|---|---|---|
| `ok` | < `loss_rate` × 50% | 绿 |
| `warning` | 50%-80% | 黄 |
| `danger` | 80%-100% | 橙 |
| `triggered` | ≥ 100% | 红 |
| `inactive` | 状态非 holding | 不显示 |

其中 `actual_rate = (entry_price - current_price) / entry_price × 100%`(盈为负数)。

### 5.2 触发后果

- **前端**:
  - 详情页持仓卡片:进度条 + 文字
  - 首页自选股卡片:红/橙小圆点(danger / triggered)
  - 详情页简评:被 `stop_loss_triggered=true` 标记,显"⚠ 止损"
- **cron**:扫所有 holding 股票；只有 `triggered`，即实际亏损达到或超过用户止损阈值时，才强制覆盖为 `action='sell'`、`signal='red'`

### 5.3 推送通道

H5 股票详情页已通过 Supabase Realtime 订阅 `stock_briefs`，红色信号可触发浏览器 Notification。微信/抖音小程序订阅消息和邮件摘要仍留作后续。

## 6. 数据流图

```
┌──────────────────────────────────────────────────┐
│ Tushare cron(每日 15:35)                         │
│   ↓                                              │
│ 同步 stock_prices(user_id 隔离)                  │
│   ↓                                              │
│ 对每个 status='holding' 跑 generateBrief(uid)   │
│   ↓                                              │
│ 确保 60 个交易日样本 + 算指标 + 拉买入理由/观点  │
│   ↓                                              │
│ 强止损检查 → 强制 sell OR 调 DeepSeek LLM         │
│   ↓                                              │
│ upsert stock_briefs(UNIQUE user+stock+date)       │
└──────────────────────────────────────────────────┘
                       ↓
        GET /api/stocks/:id/brief?days=7
                       ↓
              前端时间线渲染
```

## 7. API 速查

| 端点 | 用途 | Body |
|---|---|---|
| `POST /api/stocks/:id/buy` | 进入 holding | `{entryPrice, lossRate, buyReason}` |
| `POST /api/stocks/:id/sell` | 退出到 watching | `{exitReason?}` |
| `GET /api/stocks/:id/stop-loss-alert` | 4 档止损状态 | - |
| `POST /api/stocks/:id/brief/generate` | 强制跑一次简评 | - |
| `GET /api/stocks/:id/brief?days=N` | 最近 N 天 brief 缓存 | - |
| `GET /api/ai/daily-brief/:stockId` | (老端点)返回完整 brief | - |
| `GET /api/stocks` | 列表(含 `stop_loss_alert` 字段) | - |

## 8. 不做的事(明确边界)

- ❌ "形成投资判断"节点 — 产品不替用户判断
- ❌ "买点出现"信号 — 同上
- ❌ 减仓 / 加仓等复杂状态 — 维持 2 状态
- ❌ 小程序订阅消息 / 邮件摘要 — 留 TODO
- ❌ 自定义价位提醒(不依赖 loss_rate)
- ❌ 多用户协作
- ❌ 本版本外部研报 PDF 上传与图片视觉真实验收 — 已列入 P1 下一版

## 9. 关键文件

- `server/src/ai/daily-brief.service.ts` — 简评生成主逻辑
- `server/src/stocks/price-history.ts` — 60 个交易日读取与不足回填
- `server/src/stocks/stocks.service.ts` — `buy/sell/getStopLossAlert/calcStopLossRaw`
- `server/src/stocks/daily-sync.service.ts` — cron 联动
- `server/migrations/0002_stock_status.sql` — 状态字段
- `server/migrations/0003_brief_signal.sql` — stock_briefs 表
- `server/migrations/0007_schema_consistency.sql` — boolean 与唯一索引一致性
- `src/pages/buy/index.tsx` — 买入表单
- `src/pages/stock/index.tsx` — 状态徽章 + 持仓卡 + 止损条 + brief 时间线
- `src/pages/index/index.tsx` — 持仓红点
