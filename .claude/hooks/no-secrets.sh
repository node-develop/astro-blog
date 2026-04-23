#!/usr/bin/env bash
# PreToolUse hook: blocks Edit/Write if target file is sensitive or content looks like a secret.
# Exit 2 = block + stderr shown to Claude. Exit 0 = allow.
set -euo pipefail

# Read JSON payload from stdin (tool_name, tool_input, cwd, ...)
PAYLOAD=$(cat)

# Extract file_path via node (always available in this project) to avoid jq dep.
FILE_PATH=$(node -e "
  let s='';process.stdin.on('data',c=>s+=c);
  process.stdin.on('end',()=>{
    try { const j=JSON.parse(s); console.log(j.tool_input?.file_path ?? ''); }
    catch { console.log(''); }
  });
" <<<"$PAYLOAD")

if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Block edits to .env files (not .env.example)
if [[ "$FILE_PATH" =~ \.env(\..*)?$ ]] && [[ ! "$FILE_PATH" =~ \.env\.example$ ]]; then
  echo "BLOCKED: editing .env files is not allowed. Use .env.example for templates." >&2
  exit 2
fi

# Block edits to drizzle/meta/_journal.json (migration journal — auto-managed)
if [[ "$FILE_PATH" =~ drizzle/meta/_journal\.json$ ]]; then
  echo "BLOCKED: drizzle/meta/_journal.json is auto-generated. Use 'pnpm db:generate'." >&2
  exit 2
fi

# Scan content for obvious secrets
CONTENT=$(node -e "
  let s='';process.stdin.on('data',c=>s+=c);
  process.stdin.on('end',()=>{
    try { const j=JSON.parse(s); console.log(j.tool_input?.content ?? j.tool_input?.new_string ?? ''); }
    catch { console.log(''); }
  });
" <<<"$PAYLOAD")

if echo "$CONTENT" | grep -E -q '(AKIA[0-9A-Z]{16}|-----BEGIN (RSA|OPENSSH|EC) PRIVATE KEY-----|sk-[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,})'; then
  echo "BLOCKED: content contains what looks like a real secret (AWS key / private key / API token)." >&2
  exit 2
fi

exit 0
