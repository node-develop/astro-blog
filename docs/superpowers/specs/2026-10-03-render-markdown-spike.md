# Спайк: `renderMarkdown` в Astro 7.3 для API-loader'а

Дата: 3 октября 2026
План: `docs/superpowers/plans/2026-10-03-api-only-migration.md` (этап 0, промпт 0.1)
Версии: `astro` 7.3.1, `@astrojs/markdown-remark` 7.3.0

## Вывод

**`context.renderMarkdown()` уважает `markdown.processor`.** Loader этапа 2 может рендерить статьи из снапшота через `renderMarkdown`, запасной `src/lib/markdown/pipeline.ts` с `createMarkdownProcessor` не нужен. Источник конфигурации пайплайна остаётся один: `astro.config.ts`.

Одна поправка к плану: в Astro 7.3.1 у `renderMarkdown` **нет опции `frontmatter`**. Frontmatter берётся из самой строки, поэтому в loader надо передавать документ целиком, с YAML-шапкой, а не `renderMarkdown(body, {frontmatter})`, как записано в «Контракте сборки» и в инварианте 2.

## Что проверено

Временная коллекция `spike` в `src/content.config.ts` с inline-loader'ом: тело `src/content/posts/json-ld-graph-astro.md` (Mermaid, таблицы, код, внешние ссылки), перед ним YAML-шапка `{title, description}`, H1, повторяющий `title`, формула `$E = mc^2$` и ссылка `[…](./seo-audit.md)`. Loader вызывал `renderMarkdown(doc)` и клал результат в `store.set({id, data, body, rendered, digest})`. Результат читался из `node_modules/.astro/data-store.json` после `pnpm exec astro sync` и после `pnpm build`; оба раза HTML одинаковый (114 230 символов).

| Проверка                                         | Плагин                                           | Результат                                                                                 |
| ------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `rendered.metadata.frontmatter.hasMath === true` | `remark/flag-math.ts`                            | да: `{"title":"Spike title","description":"Spike description","hasMath":true}`            |
| KaTeX отрендерен                                 | `remark-math` + `rehype-katex`                   | да, `<span class="katex">`                                                                |
| `<img src="data:image/svg+xml…`                  | `rehype-mermaid` (Playwright, `img-svg`, `dark`) | да, 1 диаграмма внутри `<picture>` с тёмным `<source>`; `<pre class="mermaid">` нет       |
| heading-anchor                                   | `rehype-slug` + `rehype-autolink-headings`       | да, 18 якорей `class="heading-anchor"`                                                    |
| `tabindex` на таблицах                           | `rehype/focusable-tables.ts`                     | да, `<table tabindex="0">`                                                                |
| дублирующий H1 удалён                            | `remark/strip-frontmatter-duplicates.ts`         | да, `<h1` в HTML нет                                                                      |
| внутренние ссылки без `.md`                      | `remark/strip-md-suffix.ts`                      | да, `./seo-audit.md` → `<a href="../seo-audit/">`                                         |
| внешние ссылки                                   | `rehype-external-links`                          | да, `rel="nofollow noopener noreferrer" target="_blank"`                                  |
| подсветка кода                                   | shiki из `markdown.shikiConfig`                  | да, `astro-code`                                                                          |

Все пять пунктов из промпта выполняются, плюс три соседних.

## Почему это работает: код Astro

`renderMarkdown` в контексте loader'а это `#processMarkdown` из `node_modules/astro/dist/content/content-layer.js`:

```js
async #processMarkdown(content, options) {
  if (!this.#markdownRenderer) {
    const { markdown, image } = this.#settings.config;
    this.#markdownRenderer = await markdown.processor.createRenderer({
      image,
      syntaxHighlight: markdown.syntaxHighlight,
      shikiConfig: markdown.shikiConfig,
      gfm: markdown.gfm,
      smartypants: markdown.smartypants
    });
  }
  const { frontmatter, content: body } = parseFrontmatter(content);
  const { code, metadata } = await this.#markdownRenderer.render(body, {
    frontmatter,
    fileURL: options?.fileURL
  });
  return { html: code, metadata: { ...metadata, imagePaths: … } };
}
```

Glob-loader рендерит `.md` через `getRenderFunction` из `node_modules/astro/dist/vite-plugin-markdown/content-entry-type.js`:

```js
async getRenderFunction(config) {
  const { markdown, image } = config;
  const processor = await markdown.processor.createRenderer({
    image,
    syntaxHighlight: markdown.syntaxHighlight,
    shikiConfig: markdown.shikiConfig,
    gfm: markdown.gfm,
    smartypants: markdown.smartypants
  });
  return async function renderToString(entry) {
    const result = await processor.render(entry.body ?? "", {
      frontmatter: entry.data,
      fileURL: entry.filePath ? pathToFileURL(entry.filePath) : void 0
    });
    …
  };
}
```

Оба пути создают рендерер одним и тем же вызовом `markdown.processor.createRenderer(...)` с одинаковыми аргументами, то есть из `unified({...})` в `astro.config.ts`. Отличие одно: откуда берётся frontmatter.

- Glob-loader: `entry.data`, сырой frontmatter из `getEntryInfo` (до Zod).
- `renderMarkdown`: `parseFrontmatter(content)` по переданной строке.

Тип опций в `node_modules/astro/dist/content/loaders/types.d.ts` это подтверждает:

```ts
export interface RenderMarkdownOptions {
  /** The file URL of the markdown file being rendered */
  fileURL?: URL;
}
renderMarkdown(content: string, options?: RenderMarkdownOptions): Promise<RenderedContent>;
```

## Что из этого следует для loader'а (этап 2, промпт 2.1)

1. Вызывать `renderMarkdown(article.content)`, где `content` это полный Markdown с YAML-шапкой, как он лежит в `content_publications.content`. Строка без шапки даёт пустой frontmatter: `flag-math` не упадёт (`parseFrontmatter` на строке без шапки возвращает `{}`, проверено), а `strip-frontmatter-duplicates` молча перестанет убирать H1 и лид. Инвариант 2 плана надо читать как «в `renderMarkdown` уходит документ с frontmatter» и закрепить тестом на отсутствие `<h1` в `rendered.html`.
2. `entry.body` и `data` loader получает отдельно, своим `parseFrontmatter` (тем же, что использует Astro, из `@astrojs/markdown-remark`), и прогоняет `data` через `parseData`.
3. `fileURL` loader не передаёт: файла нет. В текущем пайплайне он нужен только для относительных путей к картинкам, которые Astro обрабатывает как локальные ассеты; в постах сейчас нет ни одной картинки с относительным путём (`![…](./…)`: 0 файлов в RU и EN). Если в снапшоте появятся относительные пути к картинкам, это придётся решать отдельно.
4. Относительная ссылка `./seo-audit.md` превратилась в `../seo-audit/`. Это поведение `strip-md-suffix` и одинаково для обоих путей, но сверка HTML «файлы против снапшота» (промпт 2.7) должна это учитывать.
5. Рендерер кэшируется на экземпляр content layer (`#markdownRenderer`), Playwright для Mermaid поднимается так же, как при файловой сборке. Отдельной настройки не нужно.

## Побочное наблюдение для промпта 0.5

`rehype-mermaid` в стратегии `img-svg` отдаёт `<img alt="" height="…" id="mermaid-0" src="data:image/svg+xml,…">` внутри `<picture>`. `alt` пустой, потому что в диаграмме нет `accTitle`. Плагин `mermaid-figure` должен искать `<picture>`, а не голый `<img>`.

## Что не проверялось

- `.mdx`: `renderMarkdown` рендерит только Markdown. Сейчас в `src/content/posts` MDX-постов нет (0 файлов `.mdx`), но если появятся, через снапшот они не пройдут.
- Сверка HTML всех 14 страниц «файл против снапшота»: это промпт 2.7.

Временная коллекция удалена, `src/content.config.ts` возвращён к исходному виду, `astro sync` перезапущен.
