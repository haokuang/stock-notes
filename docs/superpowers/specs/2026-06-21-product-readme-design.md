# 产品化 README 设计

## 目标

将根目录 `README.md` 从 Taro 脚手架使用说明重写为 GitHub 项目首页，使首次访问者能快速理解产品用途、核心能力、运行架构、最低配置和启动方式，同时让开发者能找到完整运维与设计文档。

## 目标读者

- 想了解项目能解决什么问题的使用者。
- 准备本地运行或 Docker 部署的开发者。
- 需要继续开发股票研究、笔记或 Agent 能力的协作者。

## 信息结构

1. **项目定位**：A 股研究笔记与 AI 投研 Agent，支持 H5 和微信小程序。
2. **核心能力**：自选股与持仓状态、交易纪律、Markdown 笔记与永久高亮、AI 每日简报、股票研究 Agent、多模型与联网检索。
3. **架构概览**：Taro/React 前端、NestJS 后端、Supabase Auth/Postgres/Realtime，以及外部行情、模型、搜索和 TOS。
4. **快速开始**：Node/pnpm 前置条件、安装、最低必需环境变量、启动地址。
5. **运行方式**：非 Docker 本地开发、Docker 开发、Docker 生产、微信小程序构建。
6. **质量与开发约束**：常用测试命令，以及 pnpm、Network、UI 组件、Tailwind 的核心规则。
7. **项目结构与深入文档**：只保留高层目录树，链接 Docker、Supabase、Roadmap、状态机和 Agent 发布说明。

## 内容边界

- 不添加截图、徽章或不存在的线上演示地址。
- 不声称尚未完成的功能可用。
- 不展开通用 Taro 页面模板、组件全集或基础教程。
- Docker 只覆盖 H5、NestJS 和微信小程序；明确抖音 Docker 已取消，但保留现有非 Docker 构建说明。
- 环境变量只展示基础启动必需项：`SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`，以及 `SUPABASE_DB_PASSWORD` / `SUPABASE_DB_URL` 二选一；其余链接到 `.env.example`。
- 不复制或暴露 `.env.local` 中的真实值。

## 验证

- README 中的命令必须存在于 `package.json`。
- README 中的文档链接必须指向已存在文件。
- `pnpm validate`、`pnpm test:prelaunch`、`pnpm test:docker` 通过。
- Markdown 无占位内容、虚构地址或失效的本地相对链接。
