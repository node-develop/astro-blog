#!/bin/sh
set -e

# SINGLE-REPLICA ASSUMPTION
# Migrations and the posts_meta backfill run on every container start with no
# advisory lock or leader election. Two replicas booting at the same time would
# execute them concurrently. Do not scale this service horizontally without
# first moving these two steps into a separate one-shot job (see CLAUDE.md
# "Деплой"). Both steps are deliberately fail-loud: a failure aborts startup
# instead of serving traffic against a half-migrated schema.

# A secret that is set but too short used to make the worker exit quietly in
# the background while the container kept serving without one. Unset means the
# worker is deliberately disabled. ${#VAR} counts bytes in dash; the server and
# the worker script measure bytes too (src/lib/content-api/heartbeat.ts).
if [ -n "$CONTENT_WORKER_SECRET" ] && [ "${#CONTENT_WORKER_SECRET}" -lt 32 ]; then
  echo "[entrypoint] CONTENT_WORKER_SECRET must be at least 32 bytes (unset it to disable the publication worker)" >&2
  exit 1
fi

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
