#!/usr/bin/env bash
# PreToolUse hook: blocks change-detector tests — test files that read application
# source / config text and regex it ("page contains buildLandingNodes", CI step
# order, astro.config literals). Such tests break on behaviour-preserving
# refactors and pass on real regressions. See .claude/skills/write-tests/SKILL.md.
#
# Escape hatch for a rare legitimate case (e.g. every `.prose` consumer must load
# content.css): put `test-guard: allow-source-read — <reason>` in the file.
# Exit 2 = block + stderr shown to Claude. Exit 0 = allow.
set -euo pipefail

PAYLOAD=$(cat)

field() {
  node -e "
    let s='';process.stdin.on('data',c=>s+=c);
    process.stdin.on('end',()=>{
      try { const i=JSON.parse(s).tool_input ?? {}; process.stdout.write(String($1 ?? '')); }
      catch { process.stdout.write(''); }
    });
  " <<<"$PAYLOAD"
}

FILE_PATH=$(field "i.file_path")
[[ "$FILE_PATH" =~ \.(test|spec)\.tsx?$ ]] || exit 0

CONTENT=$(field "i.content ?? i.new_string")
MARKER='test-guard: allow-source-read'
if grep -qF "$MARKER" <<<"$CONTENT" || { [[ -f "$FILE_PATH" ]] && grep -qF "$MARKER" "$FILE_PATH"; }; then
  exit 0
fi

grep -qE 'readFileSync|readFile\(' <<<"$CONTENT" || exit 0

SOURCE_TEXT='\.astro["'"'"'`]|src/(pages|layouts|components|middleware)|\.github/|astro\.config|package\.json|tsconfig|\.claude/|Dockerfile'
if HITS=$(grep -nE "$SOURCE_TEXT" <<<"$CONTENT"); then
  cat >&2 <<EOF
BLOCKED: $FILE_PATH reads application source/config text to assert on it:
$(sed 's/^/  /' <<<"$HITS" | head -5)
That is a change-detector test: it fails on refactors and passes on real bugs.
Test the observable result instead (see .claude/skills/write-tests/SKILL.md):
  - logic in src/lib/**           → call the function (tests/unit)
  - page markup / JSON-LD / meta  → assert on dist/ or the served page (tests/built)
  - DB / actions                  → tests/integration (Testcontainers)
  - config / CI wiring            → no test; typecheck, the build and CI itself cover it
If reading source really is the behaviour under test, add the comment
"$MARKER — <reason>" to the file.
EOF
  exit 2
fi

exit 0
