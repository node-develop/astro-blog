#!/usr/bin/env bash
# SessionStart hook: shows git status + branch so Claude sees repo state on start.
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "detached")
CHANGED=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
AHEAD_BEHIND=$(git rev-list --left-right --count "@{u}...HEAD" 2>/dev/null || echo "0 0")

cat <<EOF
[session-start] branch: ${BRANCH} | changed files: ${CHANGED} | behind/ahead: ${AHEAD_BEHIND}
EOF

exit 0
