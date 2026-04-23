#!/usr/bin/env bash
# PostToolUse hook: formats TS/Astro/JSON files after Edit/Write using prettier.
# Silent on success, prints to stderr on failure but does NOT block (exit 0).
set -euo pipefail

PAYLOAD=$(cat)

FILE_PATH=$(node -e "
  let s='';process.stdin.on('data',c=>s+=c);
  process.stdin.on('end',()=>{
    try { const j=JSON.parse(s); console.log(j.tool_input?.file_path ?? ''); }
    catch { console.log(''); }
  });
" <<<"$PAYLOAD")

if [[ -z "$FILE_PATH" ]] || [[ ! -f "$FILE_PATH" ]]; then
  exit 0
fi

# Only format files we care about
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.astro|*.json|*.md|*.mdx|*.css|*.yaml|*.yml)
    ;;
  *)
    exit 0
    ;;
esac

# Run prettier if available (pnpm-managed), swallow errors — don't block the agent.
if command -v pnpm >/dev/null 2>&1 && [[ -f package.json ]]; then
  pnpm exec prettier --write --log-level=error "$FILE_PATH" 2>/dev/null || true
fi

exit 0
