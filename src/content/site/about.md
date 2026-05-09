---
title: Обо мне
description: "Artyom Kashuta — full-stack & AI engineer. 5+ лет в backend, distributed systems и LLM/agent workflows. Платформы на 700 RPS / 15k MAU, миграция 20+ микросервисов на gRPC (−32% latency)."
---

## Кто я

Artyom Kashuta. Full-stack и AI-инженер. **5+ лет вожу production-системы** — API,
data-пайплайны, LLM/agent workflows и cloud-инфра. Работаю удалённо.

**Сейчас:** AI Automation Engineer (контракт) в [TaxDome](https://taxdome.com) —
проектирую и поставляю end-to-end LLM/agent workflows на Python и TypeScript,
ставлю eval-системы и retrieval-пайплайны над внутренними документами и CRM-данными.

**До этого:** Staff Engineer и Team Lead в 9RED (ex. Pari) — техлидил cross-domain
архитектуру Wallet и sportsbook/casino-интеграций на **>15 000 MAU** и **700 RPS на
инстанс**.

## Чем занимаюсь

- **AI agent engineering.** End-to-end workflows на LangGraph, LangChain и n8n.
  Прямые вызовы OpenAI / Anthropic / Gemini APIs там, где нужно тонкое управление
  токенами и латенси. Eval-системы и prompt-regression-suites через LangSmith
  traces, structured outputs и golden-датасеты — чтобы качество агентов не
  деградировало с эволюцией промптов и моделей.
- **Retrieval & RAG.** Chunking, embeddings, hybrid search, reranking над
  внутренними документами и CRM-данными. Сервисы на FastAPI, агенты на стороне
  consumer'ов.
- **Backend и distributed systems.** Python (FastAPI), TypeScript / Node.js
  (Fastify), event sourcing на Apache Kafka, межсервисный обмен через gRPC,
  наблюдаемость через OpenTelemetry → Prometheus → Grafana → Mimir.
- **AI MVP-разработка.** Backend + lightweight frontend + AWS-инфра в Docker —
  чтобы быстро валидировать гипотезы и сокращать time-to-value.

## Что измеримо построил

- Платформы на **700 RPS** с **<150 ms latency** для **>15k MAU** — Wallet и
  sportsbook/casino-интеграции в 9RED.
- Миграция **20+ микросервисов** с Kafka / GraphQL Federation на gRPC contracts →
  **−32% межсервисного latency**.
- Полная observability с нуля (OpenTelemetry → Collector → Prometheus → Grafana,
  плюс Mimir для traces) → **−45% MTTR**.
- Event sourcing на Apache Kafka в 20+ сервисах → **+50% scalability**.
- Лидерство кросс-функциональной командой из 8 инженеров (3 BE, 2 FE, 3 QA) и 1 BA.

## Стек

- **Языки:** Python, TypeScript / Node.js, JavaScript, SQL (PostgreSQL / PostGIS).
- **Backend:** FastAPI, Fastify, Express; микросервисы, event sourcing, gRPC,
  REST, GraphQL, webhooks.
- **AI / LLM:** OpenAI, Anthropic, Gemini APIs; LangGraph, LangChain, LangSmith
  (evals & tracing); RAG, embeddings, vector & hybrid search; agentic-фреймворки;
  prompt engineering. **Claude Code и Cursor — daily drivers.** n8n, Make.
- **Data:** PostgreSQL, PostGIS, MongoDB, DynamoDB, Redis; Apache Kafka,
  RabbitMQ; ORMs — Prisma, Sequelize, Drizzle.
- **Cloud / observability:** AWS (EKS, S3, RDS, CloudWatch), Docker, Kubernetes,
  GitLab CI/CD, GitHub Actions; OpenTelemetry, Prometheus, Grafana, Mimir.

Подробный список с обоснованиями — на странице [/uses](/uses).

## Что написал

- **[Claude Code Guide](/courses/claude-code-guide)** — курс из 14 уроков про
  устройство Claude Code изнутри: harness, context window, skills, hooks, MCP,
  subagents, модели, антипаттерны. RU + EN, интерактивные упражнения, сертификат
  при 100% прогрессе.
- **[artka.dev](/projects/astro-blog)** — этот сайт. Astro 5 + PostgreSQL +
  Drizzle, билингв RU/EN, SSG + динамическая админка, рендер Mermaid и LaTeX
  на build-time, on-demand PNG-сертификаты через Satori.
- **[AI agent engineering writeups](/blog)** — постмортемы и разборы агентских
  систем: tool design, evaluation, production failure modes.

Что делаю прямо сейчас — на странице [/now](/now).

## Образование и языки

- **Elbrus Coding Bootcamp** — Full-stack Developer Certificate, Москва,
  2019–2020.
- **English** — Advanced (C1) · **Russian** — Native.

## Контакты

- Email: [a@artka.dev](mailto:a@artka.dev)
- GitHub: [github.com/node-develop](https://github.com/node-develop)
- LinkedIn: [linkedin.com/in/artem-kashuta](https://www.linkedin.com/in/artem-kashuta/)
- X: [@artkadev](https://x.com/artkadev)
- Telegram: [@akv6020](https://t.me/akv6020)
- RSS: [RU](/rss.xml) · [EN](/en/rss.xml)
