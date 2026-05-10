---
title: "ds4 by antirez: local coding agent on DeepSeek V4 Flash that runs on MacBook"
description: >-
  The creator of Redis wrote an inference engine in two weeks for just one model — DeepSeek V4 Flash. 1M context, 26 t/s
  on M3 Max, KV-cache on disk. How to run it and connect it to Claude Code.
pubDate: 2026-05-09
tags:
  - ai
  - local-inference
  - coding-agents
  - deepseek
  - apple-silicon
draft: false
cover: /og-default.svg
coverAlt: ds4 — local inference engine DeepSeek V4 Flash on Apple Metal
summary: >-
  Antirez wrote ds4 in two weeks — a C+Metal engine only for DeepSeek V4 Flash. 284B MoE with 1M context fits in a 128
  GB Mac thanks to 2-bit asymmetric quantization and KV-cache on disk. OpenAI/Anthropic-compatible server — a working
  local backend for Claude Code.
keywords:
  - ds4
  - antirez
  - DeepSeek V4 Flash
  - local inference
  - Apple Metal
  - coding agent
  - Claude Code local backend
  - vertical inference engine
faq:
  - question: Why a separate engine for one model when llama.cpp exists?
    answer: >-
      Universal runners must abstract: the same code should load Llama, Qwen, DeepSeek, Mistral. Abstraction =
      compromise. ds4 knows DeepSeek V4 Flash geometry at the Metal-kernel level, performs asymmetric 2-bit quantization
      (only MoE experts are quantized, the rest stays Q8), and validates logits against the official API. The price is a
      narrow bet on one model: if V4.1 or V5 appears, you need to rewrite. But for the current generation, this delivers
      performance gains that are technically unavailable to a universal runner.
  - question: What Mac do you really need?
    answer: >-
      Minimum — 128 GB unified memory and Apple Silicon (M3 Max or newer). On such hardware, 2-bit Q2 quantized models
      run (~81 GB weight), 32K context, 26 t/s generation. For 4-bit quantization and larger contexts, you need M3 Ultra
      with 256 GB+ (comfortably — 512 GB Mac Studio). On 64 GB MacBook nothing will run: the model won't fit in RAM.
  - question: Can you run it on Linux/CUDA?
    answer: >-
      Not now. The project is Metal-only, and the author honestly writes: "I might add CUDA, but I'm not promising
      anything". The CPU path exists only as a correctness check and currently crashes on macOS at the kernel level due
      to a virtual memory bug. If you don't have a Mac — ds4 isn't for you, look at vLLM/llama.cpp with DeepSeek V4
      Flash GGUF.
  - question: What is asymmetric quantization and why doesn't 2-bit kill quality?
    answer: >-
      In regular 2-bit quantization, all weights compress to 2 bits — the model loses precision and often stops reliably
      calling tools. ds4 does it differently: only MoE up/gate (IQ2_XXS) and down (Q2_K) are 2-bit quantized, which take
      up most of the weight. Shared experts, projections, and routing stay in Q8 — these are sensitive parts where
      precision loss is costly. In practice, 2-bit Q2 reliably works with coding agents, as confirmed by tests against
      official API logits.
  - question: Disk KV cache — is it just swapping?
    answer: >-
      No. The inference session state (KV checkpoint) is serialized to a file with SHA1 of token IDs as the key. When an
      agent client sends the next request with the same prefix (Claude Code typically sends ~25K system prompt tokens
      each time), the server doesn't do pre-fill from scratch — it restores the checkpoint from disk. This is the
      difference between "4 seconds to first token" and "60 seconds to first token" on a long prompt.
  - question: How is this better than OpenAI/Anthropic API?
    answer: >-
      Not better — just different. Cloud API is always faster, more reliable, and the models are smarter (current
      frontier is Sonnet 4.6, Opus 4.6, GPT 5.5). ds4 on DeepSeek V4 Flash is "quasi-frontier" with three advantages:
      zero rubles per token, full data control, offline operation. Suits private projects, agent experiments, and work
      on an airplane. Doesn't suit you if you need maximum accuracy or work with context that won't fit on your Mac.
lang: en
sourceHash: 0bcc039138d4462ded5ffff797e20e888fcb0397435ff2da7d19df5ad234e61c
manuallyEdited: false
---

> Garry Tan and Bindu Reddy on May 9, 2026 simultaneously shared the same news: Redis creator Salvatore Sanfilippo (antirez) released [`ds4`](https://github.com/antirez/ds4) — an inference engine in C+Metal that runs DeepSeek V4 Flash (284B MoE, 1M context) on a laptop. Not "technically possible," but "works with coding agents at 26 t/s". I figured out what's under the hood and how to use it as a local backend for Claude Code.

---

## 1. What happened in two weeks

On April 24, 2026, DeepSeek released the V4 series. V4 Flash is an efficiency model: 284 billion parameters total, 13 billion active (MoE), 1 million token context. Before this, models of this size only lived in the cloud.

Antirez looked at this and made a bet that universal runners can't make. He forked `llama.cpp`, spent two weeks inside it, understood the geometry of V4 Flash, **threw out everything unnecessary**, and wrote an engine from scratch in 4 files: `ds4.c` (~ inference), `ds4_metal.m` (Metal kernels), `ds4_server.c` (HTTP server), `ds4_cli.c` (REPL). On the outside, all of this speaks two protocols simultaneously: OpenAI Chat Completions (`/v1/chat/completions`) and Anthropic Messages (`/v1/messages`). That is, it connects to any agent that knows one of them.

Results that the author measured himself:

| Machine                     | Quant | Prompt       | Prefill    | Generation |
| --------------------------- | ----- | ------------ | ---------- | ---------- |
| MacBook Pro M3 Max, 128 GB  | q2    | short        | 58.52 t/s  | 26.68 t/s  |
| MacBook Pro M3 Max, 128 GB  | q2    | 11709 tokens | 250.11 t/s | 21.47 t/s  |
| Mac Studio M3 Ultra, 512 GB | q2    | short        | 84.43 t/s  | 36.86 t/s  |
| Mac Studio M3 Ultra, 512 GB | q4    | 12018 tokens | 448.82 t/s | 26.62 t/s  |

26 tokens per second of generation — this is not "you can take a look," this is **working speed for a coding agent** that writes, reads files, calls tools. On a long prompt, generation drops to 21 t/s, but thanks to KV-cache on disk, this pays for itself by the third request in the same session.

---

## 2. Three engineering tricks that make this possible

I carefully read the README and `AGENT.md` of the repository, and below is the most essential, without which ds4 wouldn't work.

### 2.1. Asymmetric 2-bit quantization

The standard approach to 2-bit quantization is to compress everything down to 2 bits, and then the model starts hallucinating in tool calling, confusing arguments, and forgetting the schema. Antirez did it differently: **only MoE experts on the routed path are quantized** (`up`/`gate` in `IQ2_XXS`, `down` in `Q2_K`) — because they take up most of the weight (the model is 284B, and almost all of it is experts). Shared experts, projections, routing — remain in Q8. These are components where loss of precision is expensive.

Effect: 2-bit quantization weighs 81 GB and fits in 128 GB of unified memory on MacBook Pro M3 Max, while reliably working in coding agents (validated by tests against official DeepSeek API logits).

### 2.2. KV-cache as first-class disk citizen

The main pain of stateless API protocols like Chat Completions: the client **sends the entire history every time**, and the server must prefill it from scratch. Claude Code, for example, sends ~25K tokens of system prompt at startup. On local hardware, this is tens of seconds before the first token.

Ds4 solves this head-on: after successful prefill, the session state (KV checkpoint) is serialized to a file, the key is SHA1 of token IDs. When the next request comes with the same prefix, the server takes the checkpoint from disk and skips prefill. From the README:

> The KV cache **is actually a first class disk citizen**. <…> Modern MacBooks have fast SSDs and compressed KV caches like the one of DeepSeek v4.

In practice, this means the difference between "4 seconds to first token on repeat call" and "60 seconds". The disk here is not swap under pressure, but logical storage: SSDs are fast enough, KV in DeepSeek V4 compresses well, and the characteristic "same system prompt + changing tail" precisely describes how a coding agent works.

### 2.3. Metal-only and one model at a time

No CUDA, no CPU fallback for production (the CPU path exists only for correctness checks and currently crashes at the macOS kernel level due to a VM bug — antirez writes about this honestly). No attempt to make a "universal runner". Only Apple Silicon, only this one model, and so on until a new version of V4 Flash appears or a much better model of the same class.

The cost is a narrow bet. The benefit is that you don't need to maintain a matrix of `(model × hardware × quant)`, and you can optimize Metal kernels for the exact geometry of layers in this specific model.

---

## 3. What I'll need: hardware, model, an hour of time

I plan to deploy this on a **MacBook Pro M3 Max, 128 GB** (the minimally viable configuration according to README). I don't have it yet, and in this section — an honest plan of what I'll do when the hardware arrives; the numbers are taken from antirez's benchmarks, but I want to double-check them on my instance.

Minimum requirements by my estimates:

- macOS on a current version (there's a VM bug in the CPU path, but the Metal path is unaffected).
- Apple Silicon with 128 GB+ unified memory. M3 Max or M3 Ultra.
- ~100 GB free space: 81 GB the model itself in Q2 + space for KV-cache on disk. For Q4 quantization — 256 GB+ RAM and ~150 GB on disk.
- Xcode Command Line Tools (for clang/Metal headers).
- ~30–60 minutes to download the model (depends on your connection).

What might not be enough for beginners: 128 GB unified memory is the level of top-spec MBP M3 Max or Mac Studio. On a 64 GB Mac, Q2 won't work: the model simply won't fit in RAM. This is not "slow," this is "no way."

---

## 4. Installation step by step

The commands below are what I'll do on day one, based on the README instructions. Where the description lacks specifics — I've added my own comments.

### 4.1. Building

```bash
# 1. Склонировать репозиторий
git clone https://github.com/antirez/ds4.git
cd ds4

# 2. Скачать 2-битный квант (81 GB; для 128 GB MBP)
./download_model.sh q2

# Скрипт качает с huggingface.co/antirez/deepseek-v4-gguf,
# поддерживает резюм через curl -C - — можно прервать и продолжить.
# Если нужен 4-битный квант (для Mac Studio 256+ GB), используй ./download_model.sh q4.

# 3. Собрать
make

# Проверить, что собралось:
./ds4 --help
./ds4-server --help
```

Building is a regular `make`, no CMake, no pkg-config. This is intentional: the project has no dependencies outside the Apple SDK.

### 4.2. First run in REPL

```bash
./ds4 -p "Объясни Redis streams в одном абзаце."
```

Without `-p`, it launches an interactive session with commands `/help`, `/think`, `/think-max`, `/nothink`, `/ctx N`, `/read FILE`, `/quit`. This is good for checking that the engine is alive and for comparing generation speed against the claimed 26 t/s.

### 4.3. Running as HTTP server

This is the mode where ds4 becomes a local backend for agents:

```bash
./ds4-server \
  --ctx 100000 \
  --kv-disk-dir /tmp/ds4-kv \
  --kv-disk-space-mb 8192
```

Parameters:

- `--ctx 100000` — context window of 100K tokens. The full 1M context takes ~26 GB just for the indexer; on a 128 GB Mac where 81 GB is already taken by the model, this leaves no room for KV-cache. 100–300K is a reasonable compromise.
- `--kv-disk-dir /tmp/ds4-kv` — directory for disk KV-cache. I'd move it to a fast SSD (external or built-in — both are fine).
- `--kv-disk-space-mb 8192` — limit on cache size. 8 GB is enough for one or two active projects; for larger sessions — increase it.

The server listens on `127.0.0.1:8000`. Endpoints:

| Endpoint                    | Protocol                             |
| --------------------------- | ------------------------------------ |
| `POST /v1/chat/completions` | OpenAI Chat Completions (+ tools)    |
| `POST /v1/completions`      | OpenAI legacy completions            |
| `POST /v1/messages`         | Anthropic Messages (for Claude Code) |
| `GET /v1/models`            | list of models                       |

Authentication via static API key (by default accepts any; README recommends `dsv4-local`).

---

## 5. Connecting as a coding agent

This is the part I dug into the topic for. All three methods below work simultaneously — each agent talks to the same `ds4-server`.

### 5.1. Claude Code → Anthropic-compatible endpoint

Claude Code can talk to any backend that exposes the Anthropic Messages API. Create a wrapper `~/bin/claude-ds4`:

```bash
#!/bin/sh
unset ANTHROPIC_API_KEY

export ANTHROPIC_BASE_URL="${DS4_ANTHROPIC_BASE_URL:-http://127.0.0.1:8000}"
export ANTHROPIC_AUTH_TOKEN="${DS4_API_KEY:-dsv4-local}"
export ANTHROPIC_MODEL="deepseek-v4-flash"

# Подменяем все алиасы Sonnet/Haiku/Opus на локальную модель —
# чтобы /model в Claude Code не дёрнул облачный fallback.
export ANTHROPIC_DEFAULT_SONNET_MODEL="deepseek-v4-flash"
export ANTHROPIC_DEFAULT_HAIKU_MODEL="deepseek-v4-flash"
export ANTHROPIC_DEFAULT_OPUS_MODEL="deepseek-v4-flash"
export CLAUDE_CODE_SUBAGENT_MODEL="deepseek-v4-flash"

# Отключаем телеметрию и не-стриминговый fallback.
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
export CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK=1
export CLAUDE_STREAM_IDLE_TIMEOUT_MS=600000

exec "$HOME/.local/bin/claude" "$@"
```

`chmod +x ~/bin/claude-ds4` — and run Claude Code as `claude-ds4` instead of `claude`. All requests will go to the local ds4 server. A subtlety that antirez himself points out:

> Claude Code may send a large initial prompt, often around 25k tokens, before it starts doing useful work. Keep `--kv-disk-dir` enabled.

Without disk KV-cache, cold startup of Claude Code will take a minute or more; with cache — after the first startup, subsequent ones will restore from disk.

### 5.2. opencode

opencode is configured via `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "ds4": {
      "name": "ds4.c (local)",
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "http://127.0.0.1:8000/v1",
        "apiKey": "dsv4-local"
      },
      "models": {
        "deepseek-v4-flash": {
          "name": "DeepSeek V4 Flash (ds4.c local)",
          "limit": { "context": 100000, "output": 384000 }
        }
      }
    }
  },
  "agent": {
    "ds4": {
      "description": "DeepSeek V4 Flash served by local ds4-server",
      "model": "ds4/deepseek-v4-flash",
      "temperature": 0
    }
  }
}
```

`limit.context: 100000` must match the `--ctx` with which `ds4-server` starts — otherwise the server will truncate, and opencode won't know about it and will send the next message expecting a non-working length.

### 5.3. Pi (antirez's mini-agent)

If you use Pi — the format is slightly different, config in `~/.pi/agent/models.json`:

```json
{
  "providers": {
    "ds4": {
      "name": "ds4.c local",
      "baseUrl": "http://127.0.0.1:8000/v1",
      "api": "openai-completions",
      "apiKey": "dsv4-local",
      "compat": {
        "supportsStore": false,
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": true,
        "supportsUsageInStreaming": true,
        "maxTokensField": "max_tokens",
        "thinkingFormat": "deepseek",
        "requiresReasoningContentOnAssistantMessages": true
      },
      "models": [
        {
          "id": "deepseek-v4-flash",
          "name": "DeepSeek V4 Flash (ds4.c local)",
          "reasoning": true,
          "contextWindow": 100000,
          "maxTokens": 384000,
          "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
        }
      ]
    }
  }
}
```

`cost: 0` — this is not marketing, it's the truth. Each request costs electricity and SSD wear, not tokens.

---

## 6. Where this will break (important pitfalls)

Real limitations I'll run into and how to work around them.

**Context window must be agreed upon everywhere.** You start the server with `--ctx 100000`, set `limit.context: 100000` in opencode, don't go beyond that in Claude Code's system prompt. If Claude Code's init-prompt is ~25K, then 75K remains for the project — realistically enough for a medium codebase, but not for huge repositories.

**Disk KV-cache is "tied" to the exact prefix.** Any edit to the system prompt, to `CLAUDE.md`, to the first messages — invalidates the checkpoint. This is not a bug, it's by design: matching is done by SHA1 of token IDs. If you often edit `CLAUDE.md`, expect cold starts. Solution — commit the system contract and don't edit it in every session.

**MTP/speculative decoding doesn't provide much speedup yet.** The README directly states: "currently provides at most a slight speedup". Don't count on doubling speed from MTP — the current implementation is correctness-gated and often triggers partial accept on complex prompts.

**One live KV-cache in memory.** The server currently doesn't batch independent requests. If two agents make requests simultaneously — the second waits for the first. This is a normal trade-off for a local single-user setup, but if you want parallel multi-tenancy on one Mac — ds4 isn't there yet.

**CPU mode crashes on fresh macOS.** This is about the debug path, not production (Metal-only is the main target), but if you habitually want to compare inference on CPU — don't: kernel panic, you'll need to reboot.

---

## 7. What this means: vertical inference engines as a trend

The main thing is not ds4 itself, but the pattern that antirez formalized.

Local inference currently looks like "universal runner `+` thousands of models in GGUF `+` wrappers of varying freshness". It works, but moves at the speed of the least popular model: it's easier to speed up Llama 3.1 in llama.cpp than to add efficient support for DeepSeek V4 — because in the first case the layer structure matches twenty other models, and in the second — appears once.

Antirez shows the opposite path. **One engine — one model — one scenario (coding agent)**. Next you need three things, and all three are in the product:

1. Inference engine with HTTP API.
2. GGUF specially prepared for this engine and its assumptions.
3. Tests and validation on the coupling with specific agent clients.

If this bet works (and the benchmarks say it does), the future of local inference is not "yet another abstraction on top of abstraction," but **"each important model gets its own ds4-like project".** When V4.1 or V5 comes out, someone from the community makes a new engine, new GGUF, new tests, and in two weeks users already have a working local setup. Old engines retire along with old models.

And second. In the README, antirez explicitly writes:

> This software is developed with strong assistance from GPT 5.5 and with humans leading the ideas, testing, and debugging.

Two weeks from forking `llama.cpp` to a production-ready narrow engine with server API — you can't do this without AI, and antirez says it directly. This switch — "one person + AI = infrastructure for an entire model in two weeks" — is more interesting to me than the t/s numbers themselves.

---

## Summary

`ds4` from antirez is not "yet another local inference." It's a narrow bet: one engine, one model (DeepSeek V4 Flash), one hardware architecture (Apple Silicon with Metal), one scenario (coding agent). Thanks to asymmetric 2-bit quantization, a 284B model fits in 128 GB MacBook, thanks to disk KV-cache it works with agents that send 25K-token system prompts, thanks to OpenAI/Anthropic compatibility it connects to Claude Code, opencode, and Pi out of the box.

If you have a Mac with 128 GB+ — this is a working local backend for serious commercial work with private code. If not — wait for DDR5 and unified memory on Linux/CUDA, or watch who next repeats this pattern for their "model + hardware" combination.

In any case, it's worth watching. I'm betting that in a year, half of serious local setups will be built this way.

---

**Sources:**

- [github.com/antirez/ds4](https://github.com/antirez/ds4) — README, benchmarks, configs
- [Garry Tan — post on X (May 9, 2026)](https://x.com/garrytan/status/2052996691586932783)
- [Bindu Reddy — post on X (May 9, 2026)](https://x.com/bindureddy/status/2052982206344409242)
- [QbitAI / 36kr: Redis Father Steps In to Build Dedicated Inference Engine for DeepSeek V4](https://eu.36kr.com/en/p/3800327282662656)
- [HN: DeepSeek 4 Flash local inference engine for Metal](https://news.ycombinator.com/item?id=48050751)
- [huggingface.co/antirez/deepseek-v4-gguf](https://huggingface.co/antirez/deepseek-v4-gguf)
