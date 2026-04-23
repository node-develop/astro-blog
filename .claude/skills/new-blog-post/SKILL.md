---
name: new-blog-post
description: Создать новую статью блога в src/content/posts/ с правильным frontmatter, поддержкой Mermaid, LaTeX и изображений. Используй, когда пользователь говорит "добавь пост", "создай статью", "новый пост".
allowed-tools: ["Read", "Write", "Bash(ls:*)", "Bash(date:*)"]
---

# Новый пост в блог

Процедура создания статьи в `src/content/posts/`.

## Шаги

1. **Уточни у пользователя** (если не указано):
   - Заголовок
   - Slug (по умолчанию: kebab-case от заголовка)
   - Теги
   - Нужен ли Mermaid / LaTeX / картинки
2. **Проверь** схему в `src/content.config.ts` — какие поля frontmatter требуются.
3. **Создай файл** `src/content/posts/<slug>.mdx` (MDX, если нужны компоненты; `.md` если чистый текст).
4. **Frontmatter** — заполни все required поля. Пример:

```yaml
---
title: "Название статьи"
description: "Короткое описание до 160 символов — для SEO/OG."
pubDate: 2026-04-23
tags: ["astro", "typescript"]
draft: false
cover: ./images/<slug>-cover.webp # опционально
---
```

5. **Структура контента**:
   - `##` для секций (не `#` — он берётся из title).
   - Mermaid: fenced code с языком `mermaid`:
     ```mermaid
     flowchart LR
       A --> B
     ```
   - LaTeX inline: `$E = mc^2$`, block: `$$\int_0^1 x^2 dx$$`.
   - Картинки: клади в `src/content/posts/images/` рядом, ссылайся относительно.
6. **Предпросмотр**: посоветуй пользователю запустить `pnpm dev` и открыть `http://localhost:4321/blog/<slug>`.

## Чеклист

- [ ] Frontmatter валиден по схеме из `content.config.ts`
- [ ] `pubDate` в формате `YYYY-MM-DD`
- [ ] `description` до 160 символов
- [ ] Изображения оптимизированы (webp/avif)
- [ ] Mermaid-блоки валидны (проверил синтаксис)
- [ ] `draft: false` если готов к публикации

## Типовые ошибки

- `# Заголовок` в теле — дубль с frontmatter `title`. Начинай с `##`.
- Mermaid сломался в build — чаще всего синтаксис. Прогоняй через https://mermaid.live до коммита.
- KaTeX не рендерит — убедись, что `katex.min.css` импортирован в layout (`src/layouts/BaseLayout.astro`).
