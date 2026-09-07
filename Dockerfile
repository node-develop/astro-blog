# syntax=docker/dockerfile:1.7

# ---------- base ----------
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /app

# ---------- deps (cached by lockfile) ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------- builder ----------
FROM base AS builder
ARG SITE_URL=https://artka.dev
ARG GIT_SHA=unknown
ARG BUILT_AT=unknown
ENV SITE_URL=$SITE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Playwright (для rehype-mermaid) тянет headless chromium на этапе билда
RUN pnpm exec playwright install --with-deps chromium-headless-shell
ENV NODE_ENV=production
RUN pnpm build
# Отделяем прод-зависимости
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts

# ---------- runner ----------
FROM node:24-bookworm-slim AS runner
ARG GIT_SHA=unknown
ARG BUILT_AT=unknown
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321 \
    GIT_SHA=$GIT_SHA \
    BUILT_AT=$BUILT_AT \
    UPLOADS_DIR=/app/dist/client/uploads

# Непривилегированный пользователь
RUN groupadd -r astro && useradd -r -g astro astro

COPY --from=builder --chown=astro:astro /app/dist ./dist
COPY --from=builder --chown=astro:astro /app/node_modules ./node_modules
COPY --from=builder --chown=astro:astro /app/package.json ./package.json
COPY --from=builder --chown=astro:astro /app/drizzle ./drizzle
COPY --from=builder --chown=astro:astro /app/scripts/migrate-prod.mjs ./scripts/migrate-prod.mjs
COPY --from=builder --chown=astro:astro /app/scripts/backfill-prod.mjs ./scripts/backfill-prod.mjs
COPY --from=builder --chown=astro:astro /app/scripts/content-worker.mjs ./scripts/content-worker.mjs
COPY --from=builder --chown=astro:astro /app/src/content/posts ./src/content/posts
COPY --from=builder --chown=astro:astro /app/src/content/site ./src/content/site
COPY --from=builder --chown=astro:astro /app/src/content/projects ./src/content/projects
COPY --from=builder --chown=astro:astro /app/src/content/courses ./src/content/courses
# Uploads from /admin/media land here; the node adapter serves dist/client
# statically, so this is the only location that is both writable and public.
# Mount a persistent volume on it in Dokploy (see docs/runbooks).
RUN mkdir -p ./dist/client/uploads && chown astro:astro ./dist/client/uploads
VOLUME ["/app/dist/client/uploads"]
COPY --from=builder --chown=astro:astro /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER astro
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:4321/api/version').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["./docker-entrypoint.sh"]
