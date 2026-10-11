# Шаблоны и native форма

Все 12 исходных шаблонов доступны как справочный материал. Сначала [CONTRACT](CONTRACT.md): никакой sample statistic, цитата, авторский опыт или произвольная квота из template не становятся фактом/обязательством статьи.

| Структура | Когда применять |
| --- | --- |
| [how-to-guide](../../vendor/claude-blog/upstream/skills/blog/templates/how-to-guide.md.upstream) | Проверяемый процесс с предпосылками и troubleshooting |
| [listicle](../../vendor/claude-blog/upstream/skills/blog/templates/listicle.md.upstream) | Отбор вариантов по явным критериям |
| [case-study](../../vendor/claude-blog/upstream/skills/blog/templates/case-study.md.upstream) | Реальные исходные данные и результат эксперимента |
| [comparison](../../vendor/claude-blog/upstream/skills/blog/templates/comparison.md.upstream) | Сравнение на одинаковых условиях, допустимы ничья и неизвестность |
| [pillar-page](../../vendor/claude-blog/upstream/skills/blog/templates/pillar-page.md.upstream) | Системный обзор с существующими связанными статьями |
| [product-review](../../vendor/claude-blog/upstream/skills/blog/templates/product-review.md.upstream) | Собственный подтверждённый тест; без него research-only обзор |
| [thought-leadership](../../vendor/claude-blog/upstream/skills/blog/templates/thought-leadership.md.upstream) | Тезис, доказательства, честная противоположная позиция |
| [roundup](../../vendor/claude-blog/upstream/skills/blog/templates/roundup.md.upstream) | Атрибутированные перспективы без придуманных интервью |
| [tutorial](../../vendor/claude-blog/upstream/skills/blog/templates/tutorial.md.upstream) | Воспроизводимый код, версии, проверки, ограничения |
| [news-analysis](../../vendor/claude-blog/upstream/skills/blog/templates/news-analysis.md.upstream) | Первичный анонс, дата события, подтверждённые следствия |
| [data-research](../../vendor/claude-blog/upstream/skills/blog/templates/data-research.md.upstream) | Реальный dataset, метод, вычисления и ограничения |
| [faq-knowledge](../../vendor/claude-blog/upstream/skills/blog/templates/faq-knowledge.md.upstream) | Вопросы читателя без обязательной квоты/дублирующего JSON-LD |

## Форма нового Markdown draft

Ниже поля для заполнения, не готовая статья. Файл `<slug>.md`, RU/EN один slug; заполнить title/description/summary в native лимитах. EN — отдельный `en/<slug>.md`, `lang: en`, `manuallyEdited: true`, sourceHash от реально переведённого RU. Существующие author/date/cover сохраняются при обновлении.

```yaml
---
title: "Точный заголовок статьи"
description: "Конкретное описание результата для читателя, без обещаний, которых нет в тексте."
summary: "Краткий самостоятельный вывод статьи: что узнал читатель, какие условия и ограничения важны для применения."
pubDate: 2026-10-11 # заменить фактической датой; при rewrite сохранить
lang: ru
tags:
  - astro # выбрать реальные релевантные slug
keywords: []
draft: true
---
```

Начните body с тезиса/контекста, затем H2/H3. Layout создаёт H1 из title. Добавляйте cover/coverAlt только для существующего asset, FAQ только если полезен. Не добавляйте generic `date`, `slug`, `heroImage`, `canonical`, собственные JSON-LD/hreflang.

Для проверяемого примера: [RU](../../tests/fixtures/blog-workflow/draft-boundaries.md), [EN](../../tests/fixtures/blog-workflow/en/draft-boundaries.md), [research](../../tests/fixtures/blog-workflow/research.md), [outline](../../tests/fixtures/blog-workflow/outline.md). Полный разбор противоречий и правил адаптации — [review всех references и templates](REFERENCES-REVIEW.md).
