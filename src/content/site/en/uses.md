---
title: What I use
description: "My development tools: editors, Claude Code and Codex, TypeScript, Python, PostgreSQL, and infrastructure for personal projects."
lang: en
sourceHash: d639c5a5c8d4f5c96c66898c20508234b23e0d44a9670dd459fb6d1e6e7fc251
manuallyEdited: false
---

Updated September 7, 2026.

These are the tools I work with and what I use them for. The combination changes between projects. My first consideration is how easily I can build, test, and maintain the result.

## Editing and working with code

**WebStorm and PyCharm** are my editors for TypeScript and Python. I use them for navigation, debugging, and refactoring. **DataGrip** is for database work: exploring a schema, writing queries, and reading execution plans.

**Claude Code and Codex** help me explore codebases, implement changes, and review code. **Cursor** is also in my toolkit for working with AI inside an editor. I check the result by reviewing the diff, running tests, and using the application.

**Git and GitHub** handle version history and pull requests. I use worktrees to keep separate tasks from getting mixed together in one branch. **tmux** helps me manage several terminal sessions.

## Backend and data

My core languages are **TypeScript with Node.js** and **Python with FastAPI**. I use TypeScript for web services and integrations, and Python for AI services, data processing, and automation.

**PostgreSQL** is my primary relational database. I like starting with a clear schema, constraints, and straightforward SQL. This blog uses **Drizzle** for its schema and migrations, and **Zod** to validate input.

I've also worked with **Redis, Kafka, and gRPC** in more complex systems. They serve specific needs: caching, events, and service communication. That combination can be unnecessary for a small project.

## AI and automation

I use the **Anthropic, OpenAI, and Gemini** APIs when an application needs a model. The choice depends on the task, output quality, response time, and cost. A model's name alone tells me little about whether it will suit a product.

My toolkit includes **LangGraph** for multi-step workflows, **LangSmith** for inspecting runs and evaluating responses, and **n8n** for integrations and automation. I use **MCP** to connect tools to agents, and **GitNexus** to explore relationships in code.

Project instructions, skills, and hooks help make useful actions repeatable. I try to add them for a specific need and keep the configuration understandable.

## What runs this site

The public pages are built with **Astro**. Articles live in Markdown; **KaTeX** handles formulas, **Mermaid** handles diagrams, and **Pagefind** provides article search.

**Docker, GitHub Actions, and Dokploy** handle builds and deployment. Publication images are stored in **Cloudflare R2**, and application data is in PostgreSQL. **Vitest** and **Playwright** check the code.

The [project page](/en/projects/astro-blog/) covers the implementation in more detail. If you'd like to discuss any of these tools, [get in touch](/en/contact/).
