# Spec: Admin Post Editor — frontmatter fields, body sanitizer, external links SEO

**Дата:** 2026-05-10
**Автор задачи:** Артём
**Триггер:** Пост `/blog/local-coding-agent` опубликовался без TL;DR, без FAQ, без обложки-карточки, с 3 тегами вместо 5, и с YAML-блоком, вылезшим в тело статьи.

---

## 1. Контекст

Реальный файл `src/content/posts/local-coding-agent.md` после сохранения через админку содержит **два YAML-блока**: первый — корректный фронтматтер из формы (без `summary`/`faq`/`keywords`/`cover`), второй — встретился plain-text-ом в теле и игнорируется PostLayout-ом.

**Корневые причины:**

1. `FrontmatterForm.tsx` не имеет полей `summary`, `keywords`, `faq` — их вообще нельзя заполнить через UI.
2. `posts.upsert` Zod-валидатор тех же полей не знает.
3. `serializeFrontmatter()` склеивает body как есть, не вырезая ведущий YAML-блок (если юзер вставил MD с фронтматтером в textarea).
4. В `astro.config.ts` нет `rehype-external-links` — outbound-ссылки рендерятся без `rel="nofollow noopener noreferrer"` и без `target="_blank"`, бесконтрольно сливая link-juice на чужие домены.
5. Рассинхрон валидаторов: `posts.upsert` принимает `description` до 300 символов, а content-схема в `content.config.ts` режет на 200 — форма пройдёт, билд упадёт.

**Acceptance criteria:**

- [ ] Через админку можно заполнить `summary` (60–280), `keywords` (массив строк), `faq` (массив `{question, answer}`) — все три попадают во фронтматтер сохранённого файла.
- [ ] Если в body есть ведущий `---…---` блок — он вырезается на сервере, и юзеру в UI показывается toast «убрал YAML-блок из тела».
- [ ] Лимиты `description` синхронизированы между `posts.upsert` и `content.config.ts` (200 в обоих).
- [ ] Внешние ссылки во всех md/mdx-постах рендерятся с `rel="nofollow noopener noreferrer" target="_blank"`. Внутренние (`/`, `#`, `artka.dev`) — без изменений.
- [ ] Опубликованный `local-coding-agent.md` починен: один корректный фронтматтер с FAQ/summary/keywords/cover/lang, чистое тело без YAML.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` зелёные.
- [ ] Vitest покрывает: `stripLeadingFrontmatter`, `posts.upsert` с новыми полями, парсинг faq-формы.
- [ ] Playwright e2e: создание поста через админку с `summary` + `faq` → сохранённый файл рендерит TL;DR и FAQ-блок.

---

## 2. Прод-ограничение

**На проде не работает `pnpm` / package install.** Деплой — `Dockerfile` multi-stage: `pnpm install --frozen-lockfile` запускается **внутри билд-стейджа**, в рантайм-стейдж попадает только `dist/` (и нужное для SSR-ostrov-ов, если оно есть). Это значит:

- Все `pnpm add` делаем **только локально** на dev-машине.
- Закоммитить **обязательно**: `package.json`, `pnpm-lock.yaml`. Без лок-файла `--frozen-lockfile` упадёт в CI.
- Никаких runtime-инсталлов. Никаких скриптов, которые ставят пакеты при первом запуске.

---

## 3. Локальная подготовка (один раз перед стартом)

```bash
cd /Users/izual/astro-blog

# 1. Поставить rehype-external-links
pnpm add rehype-external-links

# Проверить, что в package.json появилась строка вида:
#   "rehype-external-links": "^x.y.z"
# и pnpm-lock.yaml обновился.

# 2. Никаких других пакетов добавлять не нужно — gray-matter/yaml/zod
#    уже стоят (см. использование в src/lib/content/frontmatter.ts).
```

После работы агентов финальный коммит должен включать:
- `package.json`
- `pnpm-lock.yaml`
- весь diff по коду (см. §4–§7).

---

## 4. Разбивка по командам агентов

Порядок по правилу проекта (CLAUDE.md): `architect → critic` сначала, реализация делится по доменам, финальный `critic` в конце.

### 4.1. `architect` — проектирование (1 проход)

**Вход:** этот spec целиком.

**Задачи:**
1. Выбрать UI-паттерн для редактирования FAQ (карточный список с inline-редактированием против модалки) — обосновать.
2. Решить, где жить функции `stripLeadingFrontmatter`: оставить в `src/lib/content/frontmatter.ts` (рядом с парсером/сериализатором) — да/нет, обосновать.
3. Где показывать warning «YAML вырезан из тела»: в `EditorShell` после ответа `posts.upsert`, через возвращаемое поле `warnings: string[]`.
4. Решить, нужен ли отдельный schema-источник истины для админки или хватит `z.infer<>` поверх content-схемы.

**Выход:** файл `docs/superpowers/plans/2026-05-10-admin-post-editor-frontmatter-fix.md` с короткими решениями и обоснованиями (под 400 слов).

### 4.2. `critic` — ревью архитектуры (быстрый прогон)

Разнести план architect-а на предмет: оверинженеринга, потери fail-fast валидации, классов/this (в проекте функциональный стиль обязателен), нарушений запретов из CLAUDE.md.

### 4.3. `backender` — серверная часть

Файлы:

- **`src/lib/content/frontmatter.ts`** — добавить `stripLeadingFrontmatter(body)` и интегрировать в `serializeFrontmatter`. Возвращать в `serializeFrontmatter` пару `{ output: string, hadFrontmatter: boolean }`, чтобы action мог пробросить warning.
- **`src/actions/posts.ts`** — расширить Zod-валидатор `posts.upsert`:
  - добавить `summary`, `keywords`, `faq` (схемы скопировать из `src/content.config.ts`, чтобы один источник истины);
  - синхронизировать `description.max(200)`;
  - возвращать `{ ok: true, slug, warnings: string[] }`.
- **`src/lib/content/__tests__/frontmatter.test.ts`** (или ближайший существующий) — Vitest на `stripLeadingFrontmatter`:
  - body без YAML → не меняется, флаг `false`;
  - body с одним `---…---` блоком в начале → вырезается, флаг `true`;
  - body с псевдо-YAML без закрывающего `---` → не трогаем, флаг `false`;
  - BOM в начале body → не ломает регексп.
- **`src/actions/__tests__/posts.upsert.test.ts`** — unit-тесты на:
  - сохранение поста с `summary`/`faq`/`keywords`;
  - `description.length === 250` → `BAD_REQUEST` (так как лимит 200);
  - body с ведущим YAML → возвращается `warnings: ["body_had_frontmatter"]` и файл записан без дубля.

### 4.4. `frontender` — UI и формы

Файлы:

- **`src/components/admin/FrontmatterForm.tsx`**:
  - расширить `FrontmatterInput` тремя полями (`summary`, `keywords`, `faq`);
  - `summary` — `<textarea>` 4 строки, контрол длины «X / 280», красная подсветка при < 60 или > 280;
  - `keywords` — переиспользовать `TagInput` (без slug-нормализации), placeholder «harness, prompt caching, …»;
  - `faq` — новый компонент `FaqEditor` (см. ниже).
- **`src/components/admin/FaqEditor.tsx`** (новый):
  - список карточек, на каждой два textarea (`question`, `answer`) и кнопка `×`;
  - кнопка «+ добавить вопрос» снизу;
  - inline-валидация (Q ≥ 5, A ≥ 20–2000);
  - drag-handle для переупорядочивания **необязателен в этом спринте** — отложить.
- **`src/components/admin/EditorShell.tsx`**:
  - после `posts.upsert` смотреть `result.warnings`. Если в нём `body_had_frontmatter` — показать toast «Я нашёл и убрал YAML-блок из начала тела. Поля переноси в форму выше.».
- **`src/pages/admin/posts/[slug].astro`** (если используется при редактировании) — убедиться, что при загрузке существующего файла `summary`/`keywords`/`faq` правильно мапятся в initial state формы.

### 4.5. `frontender` — astro.config.ts (тот же агент, отдельный шаг)

Файл: **`astro.config.ts`**.

```ts
import rehypeExternalLinks from "rehype-external-links";

const externalLinksOptions = {
  target: "_blank",
  rel: ["nofollow", "noopener", "noreferrer"],
  test: (node: any) => {
    const href = node?.properties?.href;
    if (typeof href !== "string") return false;
    if (href.startsWith("/") || href.startsWith("#")) return false;
    if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;
    try {
      const u = new URL(href);
      return u.hostname !== "artka.dev" && !u.hostname.endsWith(".artka.dev");
    } catch {
      return false;
    }
  },
};
```

Подключить в **обе** секции `rehypePlugins` — и в `mdx({...})`, и в `markdown: { rehypePlugins: [...] }`. Порядок: после `rehypeAutolinkHeadings`, до `rehypeKatex`.

Поднять unit-тест `src/__tests__/external-links.test.ts`:
- встроенный markdown через `unified()` пайплайн → внешний `https://github.com/...` получает `rel="nofollow noopener noreferrer" target="_blank"`;
- внутренний `/blog/foo` остаётся без изменений;
- ссылка на `https://artka.dev/about` — без изменений.

### 4.6. `critic` — финальное ревью

Прогнать diff по чек-листу:
- никаких `class`/`this` (CLAUDE.md);
- никаких `any` (за исключением `node: any` в `test:` callback из `rehype-external-links`, где это ограничение библиотеки — закомментировать почему);
- все async-функции имеют explicit return type;
- toast в EditorShell не блокирует submit и появляется ровно один раз;
- покрытие edge-cases: пустой `faq[]`, `keywords[]`, `summary === ""` — должны опционально пропускаться, не валиться валидатором.
- проверить, что pnpm-lock.yaml в коммите.

---

## 5. Починка существующего поста (вне команды агентов, делать руками)

После того как backender закончит `stripLeadingFrontmatter`:

1. Открыть `src/content/posts/local-coding-agent.md`.
2. Заменить **первый** фронтматтер на корректный (взять из `src/content/posts/ds4-deepseek-v4-flash-coding-agent.md` — это правильный близнец, который написан с полным набором полей).
3. Из тела вырезать псевдо-блок `faq: … --- ` целиком.
4. Удалить `src/content/posts/ds4-deepseek-v4-flash-coding-agent.md` (дубликат).
5. `pnpm translate` → закоммитить EN-зеркало.
6. `pnpm build` локально, проверить что `/blog/local-coding-agent` теперь рендерит TL;DR + FAQ + обложку-карточку + 5 тегов.

---

## 6. Что закоммитить итогом

- `package.json` (новый dep `rehype-external-links`).
- `pnpm-lock.yaml` (обновлённый).
- `astro.config.ts` (rehype-external-links в md+mdx).
- `src/content.config.ts` — без изменений (источник истины уже верный).
- `src/lib/content/frontmatter.ts` (+ `stripLeadingFrontmatter`).
- `src/lib/content/__tests__/frontmatter.test.ts` (новые кейсы).
- `src/actions/posts.ts` (расширенный Zod, warnings).
- `src/actions/__tests__/posts.upsert.test.ts`.
- `src/components/admin/FrontmatterForm.tsx`.
- `src/components/admin/FaqEditor.tsx` (новый).
- `src/components/admin/EditorShell.tsx` (toast по warning).
- `src/pages/admin/posts/[slug].astro` (initial state mapping).
- `src/__tests__/external-links.test.ts` (новый).
- `src/content/posts/local-coding-agent.md` (починка) и его EN-зеркало после `pnpm translate`.
- Удалить `src/content/posts/ds4-deepseek-v4-flash-coding-agent.md` (дубликат).

Conventional commits, по одной логической единице за коммит:
- `chore(deps): add rehype-external-links`
- `feat(content): rehype-external-links для md и mdx, политика nofollow noopener noreferrer`
- `fix(admin): санитайзер ведущего YAML в body + warning в action`
- `feat(admin): поля summary, keywords, faq в FrontmatterForm`
- `fix(admin): синхронизировать description.max(200) в posts.upsert и content schema`
- `fix(content): починка фронтматтера local-coding-agent`

---

## 7. Out of scope (на будущее)

- Drag-and-drop reorder в `FaqEditor`.
- Markdown-preview FAQ-ответов.
- Авто-генерация `summary` из тела через Haiku (если хочется уменьшить ручную работу — отдельный спек).
- Авто-проверка наличия дубликатов фронтматтера в существующих постах (CI-чек).
