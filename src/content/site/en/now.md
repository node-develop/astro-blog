---
title: Now
description: >-
  What I'm doing right now — AI Automation in TaxDome, eval systems, retrieval pipelines, and evolution of the
  blog/personal MCP tools. Updated roughly once a month.
sourceHash: 06b2b8e6653d280fe5ef2140a25042e25c1d028306fd661d587b62432454f5db
manuallyEdited: false
---

> Last updated: 2026-05-09

This is a page in the spirit of [nownownow.com](https://nownownow.com): what's in focus right
now, without plans for a decade.

## Work

**AI Automation Engineer (contract), [TaxDome](https://taxdome.com)** —
since January 2026.

I design and deliver end-to-end LLM/agent workflows in Python and TypeScript:
LangGraph for orchestration, LangChain for core components, n8n for glue.
Direct calls to OpenAI / Anthropic / Gemini APIs where fine-grained token
and latency control is needed.

Current focus:

- **Eval systems.** Prompt regression suites via LangSmith traces, structured
  outputs, and golden datasets — to prevent agent quality degradation
  as prompts and models evolve.
- **Retrieval pipelines.** Chunking, embeddings, hybrid search, reranking
  over internal documents and CRM data. Services on FastAPI, agents —
  on the consumer side.
- **AI MVP end-to-end.** Backend + lightweight frontend + AWS infrastructure in Docker —
  to quickly validate hypotheses and cut time-to-value.
- **Continuous reassessment** of new models, agentic frameworks, and tooling
  (Claude Code, Cursor) — what works as a daily driver for the team.

## Personal projects — September 7, 2026 update

- **artka.dev.** The content API is deployed with a contract, images and a publishing queue. See [OpenAPI](/api/v1/openapi.json).
- **Claude Code Guide.** All 14 lessons were revised, correcting commands and configuration and separating teaching examples from production implementations.
- **Content quality.** Five articles were updated in Russian and English. Reproducible writeups with code and verification results are next.

Employment information above belongs to the dated May snapshot; it does not establish a September role or employer change.

Use [contact](/en/contact/) for feedback.
