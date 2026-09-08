---
title: "Hooks: automatic checks with explicit limits"
blurb:
  A minimal PostToolUse hook, input inspection and failure handling. Why shell-command matching cannot replace
  permissions or environment isolation.
pubDate: 2026-04-23
order: 5
locale: en
updatedDate: 2026-09-08
---

A skill needs to be invoked. A hook instead runs in response to an event, such as a successful edit. Start with a handler that reports what happened before connecting a formatter or test command.

## Start with observation

In a disposable repository, merge this into `.claude/settings.json`, preserving existing settings. This example requires Node.js and a compatible shell:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/observe-edit.mjs\"",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

`PostToolUse` follows a successful tool call. The matcher selects Edit and Write, and the timeout is five seconds. `CLAUDE_PROJECT_DIR` makes the script path relative to the project root rather than the command’s current directory. Create `.claude/hooks/observe-edit.mjs`:

```javascript
let input = "";
for await (const chunk of process.stdin) input += chunk;
const event = JSON.parse(input);
process.stderr.write(`Observed tool: ${String(event.tool_name)}\n`);
```

This observes an event; it does not format or block anything. Avoid logging complete input, which may contain sensitive arguments or file contents.

## Test in two stages

First run it directly:

```bash
printf '%s' '{"tool_name":"Edit"}' | node .claude/hooks/observe-edit.mjs
```

Expect `Observed tool: Edit`. Then inspect the configuration with `/hooks` and ask Claude to edit a harmless file. A successful handler’s output may not appear in the normal conversation; inspect verbose output or debug logs. Feed malformed JSON to test the failure path separately.

Only then connect a real linter. Check its working directory, dependencies, timeout and repeated-run behavior.

## Blocking is event-specific

The [hooks reference](https://code.claude.com/docs/en/hooks) defines separate decision protocols. For PreToolUse, exit code 2 can deny a call. Structured decisions require the correct event schema. Do not treat a plausible JSON field as a universal blocking instruction.

PostToolUse runs after execution and cannot promise to prevent the preceding write. An Edit/Write matcher also does not cover changes made through Bash or another tool.

## Limits

A regex looking for a destructive command is not a shell parser or a complete deletion policy. Keep production credentials out of the exercise and enforce access through the environment.

Before saving a checkpoint in Git, inspect the diff and stage intended files explicitly. This avoids accidentally including unrelated work.

Next: [MCP](/en/courses/claude-code-guide/06-mcp/).
