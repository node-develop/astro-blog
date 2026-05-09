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

## Личные проекты

- **artka.dev v2 — финальный rollout.** Все четыре EPIC'а из спека
  `2026-05-02-llm-citable-blog-design.md` зарелижены: единый JSON-LD `@graph`,
  retrieval-frontmatter (`summary`/`keywords`/`faq`), `<Tldr>` / `<Faq>` /
  `<Compare>` / `<Definition>` / `<KeyTakeaways>` MDX-компоненты, тег-архивы
  и related-posts по Jaccard. Сейчас допиливаю **Phase 5**: курсы поверх той
  же content-модели, прогресс через PostgreSQL + Better-Auth, on-demand
  PNG-сертификаты и per-course RSS.
- **Claude Code Guide → курс.** Серия из 14 постов мигрировала в полноценный
  курс с интерактивными упражнениями (`<ExerciseCheck>`, `<CodeChallenge>`),
  авто-progress по dwell-time + IntersectionObserver и сертификатом
  при 100% прогрессе.
- **MCP-tooling.** Личный GitNexus (граф кода) + llm-wiki как daily driver
  для агентов. Эксперимент с границами tool-design: что давать агенту первым
  классом, что — в reference docs, что — в hooks.

## Недавно закрыто

- **SEO-аудит блога — две волны фиксов.** Identity refresh через JSON-LD граф
  (Person с реальным CV, `sameAs`, raster avatar и Organization-logo), title
  и description под профиль AI/backend, BreadcrumbList + WebPage / CollectionPage
  на каждом landing, JSON Feed 1.1 рядом с RSS, per-page OG для всех landings.
- **Phase 4 dev-ergonomics.** View transitions на title/cards, Plausible
  (DNT-aware), сплит-сайтмэп по локалям, reading-time, скаффолд курсо-плеера.
- **Phase 3 retrieval & SEO.** Pagefind ⌘K, RelatedPosts по Jaccard, per-post
  OG через Satori build-hook, Buttondown newsletter, Giscus.
- **Phase 2 чтение.** ReadingProgress, footnotes как side-notes на ≥1280 px,
  rehype-autolink-headings с `#`-якорями, Shiki dual-theme (`github-light` /
  `github-dark-dimmed`) с `[data-theme]` swap.
- **Phase 1 design system.** Палитра paper/sienna, dark-вариант, ThemeToggle
  с no-flash bootstrap, lockup в моно.

## Что дальше

- **Постмортемы по продакшн-инцидентам в агентских системах.** Превратить
  накопленный raw-материал из 9RED Wallet и текущей работы в публичные
  writeup'ы про tool-design, eval-петли и guardrails (ETA: декабрь
  2026 — январь 2027).
- **Второй курс.** Пока в стадии outline, направление: «Production-ready agent
  loops: harness, eval, guardrails». Если есть тема, которую хотите увидеть —
  напишите.
- **Open-source нескольких MCP-серверов**, когда стабилизирую API.

---

Если хочется обсудить — пишите на [a@artka.dev](mailto:a@artka.dev) или в
[Telegram](https://t.me/akv6020).
