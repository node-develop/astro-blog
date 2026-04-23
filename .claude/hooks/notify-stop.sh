#!/usr/bin/env bash
# Stop hook: summarises what changed in the session when the agent finishes a turn.
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

CHANGED=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')

if [[ "$CHANGED" -gt 0 ]]; then
  echo "[stop] modified files: ${CHANGED}. Run 'git diff' to review."
fi

exit 0
