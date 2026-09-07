---
title: Сейчас
description: "Что я делаю прямо сейчас — AI Automation в TaxDome, eval-системы, retrieval-пайплайны и evolution блога/личных MCP-инструментов. Обновляется примерно раз в месяц."
---

> Последнее обновлено: 2026-05-09

Это страница в духе [nownownow.com](https://nownownow.com): что в фокусе прямо
сейчас, без планов на десятилетие.

## Работа

**AI Automation Engineer (контракт), [TaxDome](https://taxdome.com)** —
с января 2026.

Проектирую и поставляю end-to-end LLM/agent workflows на Python и TypeScript:
LangGraph для оркестрации, LangChain для базовых компонентов, n8n для glue.
Прямые вызовы OpenAI / Anthropic / Gemini APIs там, где нужно тонкое управление
токенами и латенси.

Сейчас фокус:

- **Eval-системы.** Prompt regression suites через LangSmith traces, structured
  outputs и golden-датасеты — чтобы качество агентов не деградировало
  с эволюцией промптов и моделей.
- **Retrieval pipelines.** Chunking, embeddings, hybrid search, reranking
  над внутренними документами и CRM-данными. Сервисы на FastAPI, агенты —
  на стороне consumer'ов.
- **AI MVP end-to-end.** Backend + lightweight frontend + AWS-инфра в Docker —
  чтобы быстро валидировать гипотезы и сокращать time-to-value.
- **Постоянная переоценка** новых моделей, agentic-фреймворков и tooling
  (Claude Code, Cursor) — что катит в команду как daily driver.

## Личные проекты — обновление 7 сентября 2026

- **artka.dev.** Развёрнут API приёма статей с контрактом, изображениями и очередью публикации. Документация доступна в [OpenAPI](/api/v1/openapi.json).
- **Claude Code Guide.** Пересмотрены 14 уроков: исправлены команды и настройки, учебные примеры явно отделены от production-решений.
- **Качество материалов.** Обновлены пять статей на русском и английском. Следующий шаг — воспроизводимые разборы с кодом и результатами проверок.

Рабочие сведения выше относятся к указанному майскому снимку. Они не подтверждают изменение роли или работодателя на сентябрь.

Обратная связь — через [контакты](/contact/).
