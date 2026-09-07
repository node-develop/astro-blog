---
title: "Hooks: automatic checks with explicit limits"
blurb:
  A minimal PostToolUse hook, input inspection and failure handling. Why shell-command matching cannot replace
  permissions or environment isolation.
pubDate: 2026-04-23
order: 5
locale: en
updatedDate: 2026-09-07
---

A hook runs a handler at a Claude Code lifecycle event. It is useful for a small automatic action, but behavior depends on the event, matcher, settings and the handler succeeding.

## Start with observation

In a disposable repository, add this to `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/observe-edit.mjs",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

Create `.claude/hooks/observe-edit.mjs`:

```javascript
let input = "";
for await (const chunk of process.stdin) input += chunk;
const event = JSON.parse(input);
process.stderr.write(`Observed tool: ${String(event.tool_name)}\n`);
```

This observes an event; it does not format or block anything. Avoid logging complete input, which may contain sensitive arguments or file contents.

## Test in two stages

Feed fixture JSON to the script through stdin. Then ask Claude to edit a harmless file and verify that the handler actually runs. Repeat with malformed JSON and inspect the error.

Only then connect a real linter. Check its working directory, dependencies, timeout and repeated-run behavior.

## Blocking is event-specific

The [hooks reference](https://code.claude.com/docs/en/hooks) defines separate decision protocols. For PreToolUse, exit code 2 can deny a call. Structured decisions require the correct event schema. The course’s old `{"action":"block"}` example was not a universal blocking instruction and has been removed.

PostToolUse runs after execution and cannot promise to prevent the preceding write. An Edit/Write matcher also does not cover changes made through Bash or another tool.

## Limits

A regex looking for a destructive command is not a shell parser or a complete deletion policy. Keep production credentials out of the exercise and enforce access through the environment.

The former automatic `git add -A` checkpoint that bypassed checks has also been removed. Inspect the diff and stage intended files explicitly.

Next: [MCP](/en/courses/claude-code-guide/06-mcp/).
