---
title: "01. What is Claude Code: harness, agent loop, and your place in it"
description: >-
  Before diving into `CLAUDE.md`, skills, and subagents, we need to agree on terminology. Otherwise, discussions about
  "cache" and "context" turn into arguments about different entities.
pubDate: 2026-04-23
tags:
  - claude-code
  - guide
draft: false
summary: >-
  Claude Code is a harness around an LLM, not the model itself. The model decides which tool to call; the harness
  executes it, returns the result, and runs the agent loop until the final answer.
faq:
  - question: How is an agent different from a chatbot?
    answer: >-
      A chatbot is model.complete(messages): it takes text and returns text. An agent is a loop where the model itself
      decides which tool to call (Read, Bash, MCP), gets the result, and continues working until a final answer. This
      loop is called an agent loop.
  - question: What is a harness in Claude Code?
    answer: >-
      A harness is a local program (Claude Code CLI or IDE plugin) that assembles the prompt, executes the model's tool
      calls, asks for permission, manages cache and hooks. The model itself is in Anthropic's cloud and has no access to
      the disk.
  - question: Can a model directly read files?
    answer: >-
      No. When we say 'the model read a file', this is shorthand for: the model made a tool_use Read call, the harness
      read the file and returned its contents in tool_result. There is no direct access for the model to the file
      system.
lang: en
sourceHash: 164cf552e592c1facc720863390880e8ac5bba52800e198403fe066021721afc
manuallyEdited: false
---

> Before diving into `CLAUDE.md`, skills, and subagents, we need to agree on terminology. Otherwise, discussions about "cache" and "context" turn into arguments about different entities.

---

## 1.1. Chatbot vs agent

**Chatbot** — this is `model.complete(messages)`. It takes text and returns text. If you want it to read something, you copy the file contents into the prompt yourself.

**Agent** — this is a loop where the model:

1. Receives a user request.
2. Decides which **tool** to call (Read a file, Bash command, code search).
3. Gets the tool result back.
4. Decides: either call another tool or respond to the user.

This loop is called the **agent loop**. In Claude Code, it's hardcoded into the CLI (harness).

```mermaid
sequenceDiagram
  participant U as User
  participant H as Harness (Claude Code CLI)
  participant M as Model (via Anthropic API)
  participant T as Tools (Read/Bash/MCP/...)

  U->>H: prompt
  H->>M: messages + system + tools
  loop Agent loop
    M-->>H: tool_use (e.g., Read("./CLAUDE.md"))
    H->>T: execute
    T-->>H: result
    H->>M: tool_result
    M-->>H: either another tool_use or final text
  end
  H-->>U: final answer
```

**Key insight:** the model doesn't do anything on your machine by itself. All actions — reading files, running commands, calling MCPs — are **tool calls** executed by the harness. The model only decides _what_ to call.

---

## 1.2. What is harness

**Harness** — this is a local program (Claude Code CLI or IDE plugin) that:

| Function               | What it does                                                             |
| ---------------------- | ------------------------------------------------------------------------ |
| Prompt assembly        | Concatenates system prompt + CLAUDE.md + skills + history + tool results |
| Tool dispatch          | Receives `tool_use` from model, executes it, returns result              |
| Permission gating      | Asks user permission for "dangerous" tools (Bash, Edit)                  |
| Cache management       | Marks cacheable blocks, updates TTL                                      |
| Subagent orchestration | Launches child sessions on `Agent` tool call                             |
| Hooks                  | Triggers your scripts on lifecycle events                                |
| MCP transport          | Supports stdio/SSE/HTTP connections to MCP servers                       |

Harness is **not the model**. The model is in Anthropic's cloud. Harness is the model's eyes, hands, and memory.

```mermaid
flowchart LR
  subgraph local["Your computer"]
    cli["Claude Code CLI<br/>(harness)"]
    fs["File system"]
    sh["Shell"]
    mcp["MCP servers<br/>(local processes)"]
  end
  subgraph cloud["Anthropic Cloud"]
    api["Anthropic API"]
    model["Claude<br/>Opus 4.7 / Sonnet 4.6 / Haiku 4.5"]
  end
  cli <--> api
  api <--> model
  cli <--> fs
  cli <--> sh
  cli <--> mcp
```

⚠️ This is important to understand: when we say "the model read a file" — this is shorthand for "the model made a tool_use Read call, the harness read the file, returned the contents in tool_result, the model saw this in the next step". The model has no direct disk access.

---

## 1.3. What actually makes up the "context" in each request

Each request to the Anthropic API contains:

```python
messages.create(
  model="claude-opus-4-7",
  system=[                       # ← кэшируемый префикс
    {"type": "text", "text": SYSTEM_PROMPT},                # ~4.2k токенов
    {"type": "text", "text": CLAUDE_MD_CONCAT},             # ваши memory-файлы
    {"type": "text", "text": LOADED_SKILLS},                # SKILL.md тех скиллов, что подгружены
  ],
  tools=[...],                   # ← кэшируемый префикс (определения всех tools)
  messages=[                     # ← НЕ кэшируется целиком, только префикс
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": [{"type": "tool_use", ...}]},
    {"role": "user", "content": [{"type": "tool_result", ...}]},
    ...
  ],
)
```

📘 From docs (`how-claude-code-works`): "Claude's context window holds your conversation history, file contents, command outputs, CLAUDE.md, auto memory, loaded skills, and system instructions".

This is all — one long document for the model. The size of this document is measured in **tokens** and limited by the **context window** (200k for Haiku, 1M for Sonnet/Opus with beta flag).

See details in [02-context-and-cache.md](./02-context-and-cache).

---

## 1.4. Versions and releases

As of 04.23.2026, current versions are:

- **Claude Code** v2.1.89 (CLI, IDE plugins)
- **Default models on Anthropic API:**
  - `opus` → Opus 4.7 (released 04.16.2026)
  - `sonnet` → Sonnet 4.6
  - `haiku` → Haiku 4.5
- **On Bedrock/Vertex/Foundry** defaults are shifted: `opus`→4.6, `sonnet`→4.5 (new models arrive later).

🧪 **Agent Teams** — experimental feature, requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. See [10-agent-teams.md](./10-agent-teams).

⚠️ **Opus 4.7** has a new tokenizer — on the same texts it consumes up to 35% more tokens than Opus 4.6. If you're upgrading from 4.6 — recalculate your limit estimates.

---

## 1.5. End-to-end example: Travel Agent

One project runs through the entire guide — **Travel Agent**. This is an AI service for travel planning:

```mermaid
flowchart TB
  subgraph fe["Frontend (React + Vite + TS)"]
    chat["Chat interface"]
    map["Route map"]
    cards["Flight/hotel cards"]
  end
  subgraph be["Backend (Node + Hono + TS)"]
    api["REST/SSE API"]
    sdk["Anthropic SDK<br/>(claude-opus-4-7)"]
    pg["Postgres<br/>(users, saved routes)"]
    redis["Redis<br/>(API response cache)"]
  end
  subgraph mcp["MCP servers"]
    flights["flights-mcp<br/>(Amadeus / Duffel API)"]
    hotels["hotels-mcp<br/>(Booking / Hotellook)"]
    weather["weather-mcp<br/>(OpenMeteo)"]
    docs["docs-mcp<br/>(our wiki / Confluence)"]
  end
  fe --> api
  api --> sdk
  api --> pg
  api --> redis
  sdk -. tool calls .-> flights
  sdk -. tool calls .-> hotels
  sdk -. tool calls .-> weather
  sdk -. tool calls .-> docs
```

In each chapter we'll answer the question: **"How do I apply this to Travel Agent?"** — with concrete config snippets, code, or CLAUDE.md.

In [12-travel-agent-blueprint.md](./12-travel-agent-blueprint) the final repository structure with all artifacts comes together.

---

## 1.6. Quick reference of CLI commands used in the guide

| Command                 | What it does                              | Chapter                                                     |
| ----------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| `/context`              | Visualizes current window fill            | [02](./02-context-and-cache)                                |
| `/compact [hint]`       | Compresses history, frees space           | [02](./02-context-and-cache)                                |
| `/clear`                | Full session reset (restarts, cache lost) | [02](./02-context-and-cache)                                |
| `/model [name]`         | Switch model in current session           | [02](./02-context-and-cache), [10](./11-models-and-pricing) |
| `/agents`               | Subagent manager                          | [09](./09-subagents)                                        |
| `/plugin install <ref>` | Install plugin from marketplace           | [07](./07-plugins)                                          |
| `/mcp`                  | List connected MCP servers                | [06](./06-mcp)                                              |
| `/permissions`          | Current allow/deny rules                  | [05](./05-hooks)                                            |
| `/release-notes`        | Changes in version                        | —                                                           |

---

**Next →** [02. Context window and prompt cache](./02-context-and-cache)
