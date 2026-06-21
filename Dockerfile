# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
COPY server/package.json ./server/package.json
RUN pnpm install --frozen-lockfile

FROM base AS development
COPY . .

FROM development AS web-build
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
RUN pnpm build:server
RUN pnpm --filter server deploy --prod /opt/server
RUN cp -R server/dist /opt/server/dist

FROM node:22-bookworm-slim AS server-runtime
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
