---
title: "A local coding agent with ds4: what to test before buying hardware"
description:
  ds4 supports multiple models and GPU backends. Check configuration, privacy and task quality before
  choosing hardware, without relying on unsupported benchmark claims.
pubDate: 2026-05-09
tags:
  - ai
  - local-inference
  - coding-agents
  - deepseek
  - apple-silicon
draft: false
cover: /og-default.png
coverAlt: artka.dev — technical blog
summary:
  ds4 supports multiple models and GPU backends. Check configuration, privacy and task quality before choosing
  hardware, without relying on unsupported benchmark claims.
keywords:
  - ds4
  - antirez
  - DeepSeek V4 Flash
  - local inference
  - Apple Metal
  - coding agent
  - Claude Code local backend
  - vertical inference engine
lang: en
sourceHash: af8be2575c236f4d4259efd469b208e82718ee954fcbf3bbfe0be12eda3e8a63
manuallyEdited: false
updatedDate: 2026-09-07
---

Running a model locally and getting a useful coding agent are different milestones. The first produces a terminal response. The second produces a correct change that passes tests without costing more time to repair than manual work would take.

This article reviews the project and proposes an evaluation. It is not a first-hand benchmark on a high-memory Mac. Earlier advice describing ds4 as Metal-only, Flash-only, with a universal 128 GB minimum is obsolete and should not guide a hardware purchase.

## What changed in ds4

On September 7, 2026, the [antirez/ds4 repository](https://github.com/antirez/ds4) describes DwarfStar as an engine supporting Metal, CUDA and ROCm. Its model list includes DeepSeek V4 Flash and Pro and members of the GLM family. It uses GGUF files prepared for the project; an arbitrary GGUF is not necessarily compatible.

Backend support does not establish identical performance across GPUs. Read the repository’s model and platform documentation before installing. A recipe for one Mac cannot simply be carried over to a Linux machine with a different memory arrangement.

## Record the configuration first

Before downloading weights, record:

| Field                       | Why it matters                                     |
| --------------------------- | -------------------------------------------------- |
| Engine commit               | Ties results to a specific implementation          |
| Model and weight file       | Prevents comparing different models under one name |
| Quantization                | Records the memory and quality tradeoff            |
| CPU, GPU, RAM and VRAM      | Shows where weights and working data reside        |
| Context and response limits | Makes the actual workload repeatable               |
| OS and driver versions      | Helps reproduce startup failures                   |
| Launch parameters           | Separates model behavior from engine settings      |

The file size on disk is not total process memory. Working buffers, context and other applications also need room. Loading successfully does not show how a long conversation will behave. Test the relevant setup before buying hardware, or find a reproducible report with matching parameters.

## Three tasks instead of one impressive answer

Use a small copy of a familiar repository without secrets. Choose tasks with known outcomes:

1. **Diagnose a bug.** Supply a failing test and ask for the data path. Check references to real files rather than confidence of phrasing.
2. **Make a local fix.** Require the public API to stay stable. Inspect the diff and neighboring scenarios.
3. **Recover from a tool failure.** Return a failed test result. Check whether the agent fixes its cause or repeats the command.

For every run, record time to the first useful action, total duration, test results, interventions and memory consumption. Record generation speed separately: faster text does not necessarily mean a faster accepted PR.

## Check locality across the whole workflow

A local model can still use remote search, an MCP server or cloud fallback. A localhost endpoint alone does not prove that data stays on the machine. Inspect tool configuration, outgoing connections and behavior with networking disabled.

Use test data and only the required tools. Test cancellation separately. Sending messages or modifying remote resources requires its own permissions; local inference does not make those operations harmless.

## Define success before the experiment

A useful acceptance criterion could be: fix a selected regression, preserve the API and pass tests without manually rewriting the solution. That is a proposed criterion, not a result measured here.

When a task fails, preserve the specific failure: an invalid tool call, forgotten instruction, memory exhaustion or incorrect edit. Those details suggest the next experiment. “Replaces a cloud agent” tells a reader little without them.

The [agent loop lesson](/en/courses/claude-code-guide/08-tool-calls-and-loop/) separates the model from tools and execution. The [CLAUDE.md template](/en/blog/claude-md-12-rules/) covers repository instructions.
