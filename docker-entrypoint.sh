#!/bin/sh
set -e

if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] applying migrations..."
  node ./scripts/migrate-prod.mjs
else
  echo "[entrypoint] DATABASE_URL not set, skipping migrations"
fi

echo "[entrypoint] starting astro server..."
exec node ./dist/server/entry.mjs
