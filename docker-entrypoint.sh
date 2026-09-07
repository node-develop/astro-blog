#!/bin/sh
set -e

# SINGLE-REPLICA ASSUMPTION
# Migrations and the posts_meta backfill run on every container start with no
# advisory lock or leader election. Two replicas booting at the same time would
# execute them concurrently. Do not scale this service horizontally without
# first moving these two steps into a separate one-shot job (see CLAUDE.md
# "Деплой"). Both steps are deliberately fail-loud: a failure aborts startup
# instead of serving traffic against a half-migrated schema.

if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] applying migrations..."
  node ./scripts/migrate-prod.mjs
  echo "[entrypoint] backfilling posts_meta..."
  node ./scripts/backfill-prod.mjs
else
  echo "[entrypoint] DATABASE_URL not set, skipping migrations + backfill"
fi

echo "[entrypoint] starting astro server..."
if [ -n "$CONTENT_WORKER_SECRET" ]; then
  node ./scripts/content-worker.mjs &
fi
exec node ./dist/server/entry.mjs
