---
title: Сейчас
description: "Что я делаю прямо сейчас в работе и пет-проектах. Обновляется примерно раз в месяц."
---

> Последнее обновлено: 2026-05-02

Это страница в духе [nownownow.com](https://nownownow.com): что в фокусе прямо сейчас, без планов на десятилетие.

## Сейчас

- **artka.dev v2** — превращаю блог в LLM-citable knowledge node. Spec: `docs/superpowers/specs/2026-05-02-llm-citable-blog-design.md`. EPIC A (foundation, schema-graph, robots/llms.txt) задеплоен, EPIC B (entity pages) — в работе.
- **Claude Code Guide, EN** — допереводы и фактчекинг английских версий после изменений в RU-источнике.
- **Эксперименты с MCP-серверами** — личная wiki + git-граф (GitNexus) внутри редактора, тестирую границы tool-design для агентов.

## Недавно закрыто

- Структурированные данные на блоге: единый `@graph`, `BlogPosting.articleBody`, `Blog` schema, `llms.txt`, `llms-full.txt`, named-bot rules.
- Bilingual pipeline (RU → EN через Claude Haiku 4.5) с per-key hash tracking и CI-гвардом `pnpm translate:check`.
- Деплой через Dokploy webhook + миграции при старте контейнера.

## Что дальше

- EPIC C из spec'а: retrieval frontmatter (`summary`, `keywords`, `faq`) + MDX компоненты `<Tldr>`/`<Faq>`/`<Compare>`.
- EPIC D: tag archives `/tags`, `/tags/<slug>`, related-posts по Jaccard overlap.
- Постмортемы по производственным задачам — оформить накопленный материал.

---

Если хочется обсудить — пишите на [a@artka.dev](mailto:a@artka.dev).
