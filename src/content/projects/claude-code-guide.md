---
title: Claude Code Guide (RU, 14 частей)
description: "Серия из четырнадцати статей про устройство Claude Code: harness/agent loop, context, skills, hooks, MCP, subagents, модели и антипаттерны."
role: "Author, editor, translator (RU → EN)"
status: maintained
pubDate: 2026-04-01
updatedDate: 2026-04-27
featured: true
stack:
  - Markdown / MDX
  - Mermaid (build-time)
  - Astro content collections
  - Bilingual pipeline (Claude Haiku 4.5)
outcomes:
  - "14 частей, ~80 тысяч знаков на RU. Покрытие от harness/agent loop до антипаттернов."
  - "Полный EN-перевод с per-key hash tracking; CI-гвард не даёт пушнуть RU без commit'а EN-двойника."
  - "Каждая часть — самостоятельный артефакт для цитирования: TL;DR + чёткие подзаголовки."
links:
  - label: Index (RU)
    url: https://artka.dev/blog
  - label: Index (EN)
    url: https://artka.dev/en/blog
---

## Контекст

Большая часть туториалов по Claude Code — либо «поставь и пиши», либо «вот мой workflow». Не хватало материала, который объясняет, **как оно устроено внутри**: что такое harness, как считается context window, чем skill отличается от agent'а, как hooks вклиниваются в lifecycle.

## Структура

14 частей, каждая 3000–8000 знаков: введение и harness/agent loop; context window; CLAUDE.md и system context; skills; hooks; MCP-серверы и tool-design; subagents; models (Opus/Sonnet/Haiku); plan mode; worktrees; cost mechanics; Travel Agent blueprint; best practices; verification of claims.

## Что узнал

- Перевод через LLM-pipeline даёт стабильное качество ровно до тех пор, пока RU остаётся coherent — любая mid-sentence правка ломает hash.
- Mermaid-диаграммы в техническом тексте окупаются: они становятся частью извлекаемого LLM'ами контента.
- TL;DR-блоки в начале (вводятся в EPIC C) повышают вероятность цитирования больше, чем правильные H-заголовки.

## Что дальше

EPIC C parent-spec'а: добавить `summary`/`faq` frontmatter и MDX-компоненты в существующие 14 частей.
