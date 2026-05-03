---
title: Сейчас
description: "Что я делаю прямо сейчас в работе и пет-проектах. Обновляется примерно раз в месяц."
---

> Последнее обновлено: 2026-11-13

Это страница в духе [nownownow.com](https://nownownow.com): что в фокусе прямо сейчас, без планов на десятилетие.

## Сейчас

- **artka.dev v2 — финальный rollout.** Все четыре EPIC'а из spec'а
  `2026-05-02-llm-citable-blog-design.md` зарелижены: единый JSON-LD `@graph`,
  retrieval-frontmatter (`summary`/`keywords`/`faq`), `<Tldr>` / `<Faq>` /
  `<Compare>` / `<Definition>` / `<KeyTakeaways>` MDX-компоненты, тег-архивы
  и related-posts по Jaccard. Сейчас допиливаю **Phase 5**: уроко-курсы поверх
  той же content-модели, прогресс через Postgres + Better-Auth, on-demand
  PNG-сертификаты и per-course RSS.
- **Claude Code Guide → курс.** Серия из 14 постов мигрирует в полноценный
  курс `claude-code-guide` с интерактивными упражнениями (`<ExerciseCheck>`,
  `<CodeChallenge>`), авто-progress по dwell-time + IntersectionObserver и
  сертификатом по 100% прогрессу.
- **MCP-tooling.** Личный GitNexus (граф кода) + llm-wiki как daily driver
  для агентов. Сейчас экспериментирую с границами tool-design: что давать
  агенту первым классом, что — в reference docs, что — в hooks.

## Недавно закрыто

- **Phase 4 dev-ergonomics.** View transitions на title/cards, Plausible
  (DNT-aware), сплит-сайтмэп по локалям, reading-time, скаффолд курсо-плеера.
- **Phase 3 retrieval & SEO.** Pagefind ⌘K, RelatedPosts по Jaccard overlap,
  per-post OG через Satori build hook, Buttondown newsletter, Giscus.
- **Phase 2 чтение.** ReadingProgress, footnotes как side-notes на ≥1280px,
  rehype-autolink-headings с `#`-якорями, Shiki dual-theme (`github-light` /
  `github-dark-dimmed`) с `[data-theme]` swap.
- **Phase 1 design system.** Палитра paper/sienna, dark-вариант,
  ThemeToggle с no-flash bootstrap, lockup в моно.

## Что дальше

- Постмортемы по продакшн-инцидентам — превратить накопленный raw-материал
  в публичные writeup'ы (ETA: декабрь — январь).
- Второй курс — пока в стадии outline, направление: «Production-ready agent
  loops: harness, eval, guardrails». Если есть тема, которую хотите увидеть —
  напишите.
- Open-sourcing нескольких MCP-серверов когда стабилизирую API.

---

Если хочется обсудить — пишите на [a@artka.dev](mailto:a@artka.dev).
