---
title: "Claude Code Guide"
blurb: "A 14-lesson course on Claude Code internals: harness, context window, prompt cache, skills, hooks, MCP, subagents, models, anti-patterns. Built around an end-to-end Travel Agent example."
level: intermediate
status: published
duration: "~6 hours"
locale: en
pubDate: 2026-04-23
updatedDate: 2026-08-24
tags:
  - claude-code
  - guide
---

> Worked example: **Travel Agent** — Node.js backend + React frontend + LLM + MCP servers for flights/hotels/weather.
>
> Every claim in this course was checked against the official `code.claude.com/docs` and Anthropic API docs (current as of **April 23, 2026**, Claude Code v2.1.89, Opus 4.7 / Sonnet 4.6 / Haiku 4.5).

---

## Why this course

There are plenty of Twitter threads about Claude Code where half the claims are correct, a quarter are stale, and the remaining quarter are personal heuristics presented as fact. This course:

1. **Verifies** popular claims against docs and sources.
2. **Explains the internals** — agent loop, prompt cache, harness, tool dispatch.
3. **Walks through an end-to-end example** (Travel Agent) showing how to assemble it all from scratch.
4. **Gives ready-to-use recipes** — CLAUDE.md, skills, hooks, subagents, MCP, plugins.

If you're new to Claude Code, follow the lessons in order. If you already use it, jump to the lesson you need.

---

## Recurring principles across the course

1. **Context is money and quality.** The more tokens in the window, the more expensive and worse the model performs. Context management is the core skill.
2. **Skills ≠ Hooks.** Skills are probabilistic suggestions to the model. Hooks are deterministic programmatic triggers.
3. **Subagent ≠ Agent Team.** A subagent is a one-shot isolated helper. An Agent Team is a coordinated crew with a shared task list and mailbox.
4. **MCP ≠ Plugin.** MCP is the protocol for plugging in external tools. A plugin packages local artifacts (skills/hooks/agents/MCP configs).
5. **The cache lives 5 minutes.** Any pause >5 min triggers a cache miss by default. You can extend to 1 hour at the cost of 2× input tokens.

---

## Conventions

- 📘 — excerpt from official docs
- ⚠️ — common mistake / gotcha
- 💡 — practical tip
- 🧪 — experimental (may change)
- 🔧 — concrete config snippet for Travel Agent
- ✅ — verified fact (with source)
- ❌ — myth / outdated

---

## License and updates

Written on April 23, 2026 for Claude Code **v2.1.89**, targeting **Opus 4.7 / Sonnet 4.6 / Haiku 4.5**.

If you're reading this 6+ months later, check the Claude Code release notes (`/release-notes` in the CLI) and re-verify against lesson 14.
