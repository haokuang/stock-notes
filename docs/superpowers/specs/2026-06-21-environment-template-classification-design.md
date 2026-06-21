# 环境变量示例分类设计

## 目标

重整 `.env.example`，保留项目当前支持的全部环境变量，同时明确哪些变量是基础启动必需、哪些仅在启用对应功能时需要、哪些只用于生产或 Docker。模板不再暗示 `.env.local` 必须复制并填写全部字段。

## 分类规则

### 基础启动必需

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- 数据库凭据二选一：推荐 `SUPABASE_DB_PASSWORD`，兼容完整的 `SUPABASE_DB_URL`

`DB_CONNECTION_PROFILE` 有默认值，不属于必填，但与数据库凭据放在同一组说明。

### 本地开发可选

- `PROJECT_DOMAIN`：H5 默认使用相对 `/api`；小程序构建时需要真实 HTTPS API 域名。
- `H5_PROXY_TARGET`：仅覆盖 H5 开发代理目标。
- `DEFAULT_USER_ID`：仅用于没有 JWT 时的本地兼容流程。
- `TEST_LOGIN_EMAIL`、`TEST_LOGIN_PASSWORD`：仅开发环境显示测试登录入口。

### 按功能启用

- A 股行情：Tushare。
- AI：DeepSeek、MiniMax、OpenAI、视觉模型。
- Agent 联网：Tavily。
- 图片上传：TOS/S3 兼容配置。
- 邮件告警：Resend。

每组明确注明“不使用该功能可全部留空”，并保留已有安全默认值。

### 运行调优

保留 Worker 并发、轮询、心跳和租约参数及默认值。用户无需把这些参数复制到 `.env.local`，除非需要覆盖默认行为。

### 生产与 Docker

- `APP_PORT`、`TARO_APP_WEAPP_APPID` 等生产构建变量在 `.env.example` 中保留提示。
- 真实生产值应配置到未跟踪的 `.env.production`。
- 抖音 Docker 已取消，不新增抖音 Docker 专用配置；已有非 Docker 构建支持不在本次变更范围内。

## 约束

- 不修改任何变量的运行时语义。
- 不读取、复制或提交 `.env.local` 的值。
- 不删除代码仍支持的可选能力。
- 不把服务端密钥标记为前端可公开变量。

## 验证

- 对照代码环境变量引用，确认模板覆盖所有业务配置。
- 运行 `pnpm validate`。
- 运行环境加载、Docker 环境和 Provider 配置相关测试。
- 确认 `.env.local`、`.env.production` 未被 Git 跟踪。
