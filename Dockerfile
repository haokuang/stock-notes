# syntax=docker/dockerfile:1.7

FROM --platform=linux/amd64 node:22-bookworm-slim AS base
# Taro 4.1.9 / @swc/core 1.3.96 / @tarojs/plugin-doctor 不发布 linux-arm64-gnu binding。
# 必须强制 amd64 base,否则在 Apple Silicon 等 arm64 主机上 build 会找不到
# @tarojs/binding-linux-arm64-gnu 而失败(参考 docker-compose.dev.yml 的同样修复)。
# web-runtime 阶段使用多架构 nginx:alpine,不受此约束。
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# nest start --watch 触发增量编译后,nest CLI / ts-node-dev 会 spawn ps 检查进程树;
# node:22-bookworm-slim 默认不带 procps,会导致后端 HMR 报 spawn ps ENOENT。
RUN apt-get update \
  && apt-get install -y --no-install-recommends procps \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
COPY server/package.json ./server/package.json
RUN pnpm install --frozen-lockfile

FROM base AS development
COPY . .

FROM development AS web-build
# Taro 4.1.9 / @swc/core 1.3.96 / @tarojs/plugin-doctor 不发布 linux-arm64-gnu binding。
# development 阶段已强制 amd64 base,本阶段继承;web-runtime 阶段使用多架构 nginx:alpine。
ARG SUPABASE_URL
ARG SUPABASE_ANON_KEY
ENV NODE_ENV=production
ENV PROJECT_DOMAIN=
ENV SUPABASE_URL=$SUPABASE_URL
ENV SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
RUN node scripts/validate-docker-env.mjs web
RUN pnpm build:web

FROM nginx:1.27-alpine AS web-runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/dist-web /usr/share/nginx/html
EXPOSE 80

FROM development AS server-build
# 继承 development 的 amd64 base,避免在 arm64 主机上 build 触发 Taro/native binding 找不到的问题。
RUN pnpm build:server
RUN pnpm --filter server deploy --prod /opt/server
RUN cp -R server/dist /opt/server/dist

FROM --platform=linux/amd64 node:22-bookworm-slim AS server-runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY --from=server-build --chown=node:node /opt/server ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((response) => { if (!response.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["node", "dist/main.js"]

FROM development AS mini-build
