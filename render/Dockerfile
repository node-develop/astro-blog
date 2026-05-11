# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY render/package.json ./render/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter=@artka/render...

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/render/node_modules ./render/node_modules
COPY render/ ./render/
WORKDIR /app/render

ARG GIT_SHA=unknown
ENV NODE_ENV=production PORT=3002 GIT_SHA=$GIT_SHA

EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3002/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "start"]
