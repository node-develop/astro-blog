---
title: 02. Context Window and Prompt Cache
description: >-
  The most common reason "Claude suddenly became dumber" — an overflowing context window. The most common reason "it
  suddenly became expensive" — a lost cache. This chapter is about how to avoid both.
pubDate: 2026-04-23
tags:
  - claude-code
  - guide
draft: false
sourceHash: c32063ed75430858cd48b4b1840937fde29d67c50452e3c13190f419d7ee5abd
manuallyEdited: false
---

# 02. Context window and prompt cache

> The most common reason "Claude suddenly got dumber" is a full context window. The most common reason "it suddenly got expensive" is a lost cache. This chapter is about how to avoid both.

---

## 2.1. What is a context window

**Context window** — the maximum number of tokens a model sees in a single request. This includes both input (everything you send it) and space for output (what it will write).

Limits as of 23.04.2026:

|     |     |     |
| --- | --- | --- |
|     |     |     |
|     |     |     |
|     |     |     |
|     |     |     |

📘 From docs (`model-config#extended-context`): "Opus 4.7, Opus 4.6, and Sonnet 4.6 support a 1 million token context window".

**Enable 1M on Max/Team/Enterprise:**

- Opus 1M is included in the subscription.
- Sonnet 1M comes as extra usage (additional charge).
- Can be disabled via env: `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`.

⚠️ **`opusplan` mode (described below) does NOT support 1M window** — even if you enabled `sonnet[1m]`, the plan phase with Opus will run in standard 200k.

---

## 2.2. What makes up the context

Each request contains several layers. You can see them in the CLI with the `/context` command:

```mermaid
flowchart TD
  ctx["Context window (e.g., 200k tokens)"]
  ctx --> sys["System prompt (~4.2k)<br/>embedded in harness"]
  ctx --> mem["CLAUDE.md (memory)<br/>your project context"]
  ctx --> sk["Loaded skills<br/>SKILL.md descriptions"]
  ctx --> tdef["Tool definitions<br/>JSON schemas of all tools"]
  ctx --> hist["Message history<br/>user, assistant, tool_use, tool_result"]
  ctx --> tr["Tool results<br/>contents of read files and logs"]
  ctx --> auto["Auto-memory<br/>knowledge accumulated during session"]
  ctx --> out["Reserved for output"]
```

📘 `/context` (from docs `commands`): "Visualize current context usage as a colored grid. Shows optimization suggestions for context-heavy tools, memory bloat, and capacity warnings".

**What usually takes up the most tokens in a real session:**

1. **Tool results** — especially `Read` of large files and `Bash` with verbose output. The leader in "consuming" the window.
2. **Large CLAUDE.md** — if you put README, ADRs, and changelog there "just in case".
3. **Long history** — each previous tool call with its result stays in the window.
4. **Tool definitions** — definitions of all tools (including MCP) can weigh 3-15k. Especially if you have 5+ MCP servers connected with dozens of tools each.

💡 Before a complex task, run `/context` — you'll see the breakdown and understand what to remove.

---

## 2.3. Prompt cache: how it works

The Anthropic API supports **prompt caching** — a mechanism where a repeating **prefix** of a request is not recalculated from scratch.

📘 From platform docs (`build-with-claude/prompt-caching`): "By default, the cache has a 5-minute lifetime". You can explicitly set TTL = **1 hour**, but this costs **2× the input price** on write (read stays the same).

**Cache hierarchy (what counts as a "prefix"):**

```mermaid
flowchart LR
  tools["1. tools<br/>(tool definitions)"] --> system["2. system<br/>(system prompt)"]
  system --> messages["3. messages<br/>(history)"]
```

If you change an **earlier** layer — all later ones are also recalculated. For example, you add one MCP server → `tools` changes → the entire cache is invalidated.

**How much cache vs no-cache costs** (using Sonnet 4.6 as example, $3 per 1M input tokens):

|     |     |     |
| --- | --- | --- |
|     |     |     |
|     |     |     |
|     |     |     |
|     |     |     |

**Savings calculation in a real Travel Agent session:**

Say system + CLAUDE.md + tools = 25k tokens. You make 10 requests in 5 minutes.

- **Without cache:** 10 × 25k × $3/M = **$0.75**
- **With cache:** 1 × 25k × $3.75/M (write) + 9 × 25k × $0.30/M (read) = $0.094 + $0.067 = **$0.16**

Savings — **80%**. This is why prompt cache is a must-have, and losing it is a real pain.

---

## 2.4. When cache breaks

Cache is invalidated (or expires) when:

|            |     |     |
| ---------- | --- | --- |
|            |     |     |
|            |     |     |
|            |     |     |
|            |     |     |
|            |     |     |
| `/compact` |     |     |

⚠️ **Myth:** "switching models breaks prompt cache forever". Reality: the next request will be a cache miss (costs more once), then everything gets cached again on the new model.

📘 From docs `/model`: "opens a picker that asks for confirmation when the conversation has prior output, since the next response re-reads the full history without cached context".

That is, switching models is a **one-time** extra cost. Not "forever" and not "impossible". Just account for it.

---

## 2.5. `opusplan` — the feature incorrectly called "Advisor mode"

In the thread we started with, "Advisor mode" was mentioned. In official docs, there's **no such feature**. The real feature is called **`opusplan`**.

📘 From docs `model-config#opusplan-model-setting`: "Special mode that uses `opus` during plan mode, then switches to `sonnet` for execution".

```bash
# В CLI
/model opusplan
```

What happens:

```mermaid
sequenceDiagram
  participant U as User
  participant CC as Claude Code
  participant Op as Opus
  participant So as Sonnet

  U->>CC: /model opusplan
  U->>CC: Plan: design feature X
  CC->>Op: think (plan mode)
  Op-->>CC: plan + critique
  U->>CC: ExitPlanMode → execute
  CC->>So: switch to Sonnet
  CC->>So: execution per plan (tool calls)
  So-->>CC: results
```

**Limitations of `opusplan`:**

- ⚠️ Opus phase runs in **standard 200k**, even if you enabled `sonnet[1m]`.
- ⚠️ Switching is still two different models → one cache miss at the boundary (but then each model caches separately).
- 💡 Good for architectural tasks: "plan a big refactor" → detailed plan from Opus → cheap execution by Sonnet.

🔧 **For Travel Agent:** enable `opusplan` when rewriting Amadeus integration or changing DB schema. Not needed for routine React component fixes.

---

## 2.6. `/compact`, `/clear`, and auto-compaction

**`/compact [hint]`** — Claude retells the current session in brief form, replacing long history with a summary. `hint` — what to especially preserve.

```bash
/compact "сохрани решения по архитектуре MCP-серверов и текущий список открытых TODO"
```

**`/clear`** — full reset. Keeps only system + CLAUDE.md. Message cache is completely lost.

**Auto-compaction** — the harness itself runs `/compact` when the window fills above a threshold (default ~95%).

📘 Controlled by env variable **`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`** (1–100). Not `CLAUDE_CODE_AUTO_COMPACT_THRESHOLD`, as sometimes written.

```bash
# В .zshrc / .bashrc
export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=80   # запускать компакцию на 80% заполнения
```

There's also `CLAUDE_CODE_AUTO_COMPACT_WINDOW` — lets you "lie" to the harness about window size (e.g., on 1M models count as 500k so quality doesn't drop). From practice:

```bash
export CLAUDE_CODE_AUTO_COMPACT_WINDOW=400000  # держать сессию в "виртуальных" 400k
```

⚠️ **Empirical, not from docs:** many practitioners (including the original Twitter thread) claim that "after 300–400k quality drops". Anthropic has no public benchmarks on this, but the symptoms are familiar: the model starts forgetting early decisions, contradicting itself, re-reading the same files. If you hit 400k — seriously think about `/compact` or a new session.

---

## 2.7. When to `/compact`, when to `/clear`, when to start a new session

```mermaid
flowchart TD
  start{"Window > 70%?"}
  start -- no --> work["Continue working"]
  start -- yes --> task{"Current task<br/>almost complete?"}
  task -- yes --> finish["Finish, then /clear"]
  task -- no --> related{"New part of task<br/>depends on history?"}
  related -- yes --> compact["/compact with hint"]
  related -- no --> session{"Stack/module<br/>of project changing?"}
  session -- yes --> newsession["New session"]
  session -- no --> compact
```

**Rule of thumb for Travel Agent:**

- Finishing one React component → done → `/clear` before the next.
- Long debugging of one feature (several hours) → `/compact "keep context about SSE stream and current bug"`.
- Switching from frontend to backend → new session (different contexts, little in common).

---

## 2.8. Checklist: "how not to burn the window and cache"

✅ Before a long task, run `/context` — assess starting fill.
✅ Keep CLAUDE.md ≤ 5k tokens. Larger — split into subdirectory CLAUDE.md (see [03](./03-claude-md.md)).
✅ Connect MCP servers before starting work, not in the middle.
✅ If a task lasts > 5 minutes with pauses — ask harness to use 1h TTL (config flag or pass `cache_control.ttl="1h"` via SDK).
✅ Don't `Read` entire huge files (50k-line logs) — use `Grep` or offset/limit.
✅ After each completed task — `/clear`.
✅ For architectural decisions enable `opusplan` (plan by Opus, execution by Sonnet).
✅ If you catch "model is dumb after long session" — do `/compact` or start fresh.

⚠️ **What NOT to do:**
❌ Use 1M window "because it's there" — it's both expensive and worse for quality.
❌ Connect all MCP servers "just in case" — each bloats `tools`.
❌ Dump entire README, license, changelog, and dependency list into CLAUDE.md.
❌ Switch models mid-complex task without reason (or use `opusplan`).

---

**Next →** [03. CLAUDE.md: levels, imports, auto-memory](./03-claude-md)
