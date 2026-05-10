# Handoff: фикс админки + SEO внешних ссылок

**Ветка:** `feat/admin-post-editor-frontmatter-fix`
**Спека:** `docs/superpowers/specs/2026-05-10-admin-post-editor-frontmatter-fix.md`
**Дата:** 2026-05-10

Sandbox не пускает `pnpm install` (mount restrictions на `node_modules` ops) и `git add/commit` (mount на `.git/`). Поэтому ниже — ровно те команды, которые тебе нужно выполнить локально.

---

## 1. Установить пакет и обновить lockfile

```bash
cd ~/astro-blog
git checkout feat/admin-post-editor-frontmatter-fix   # ветка уже создана
pnpm install                                            # читает обновлённый package.json,
                                                        # тянет rehype-external-links@^3.0.0,
                                                        # обновляет pnpm-lock.yaml
```

`package.json` уже отредактирован — добавлена строка `"rehype-external-links": "^3.0.0"` в `dependencies`. После `pnpm install` появится правка в `pnpm-lock.yaml` — это нормально, мы её закоммитим вместе.

---

## 2. Удалить дубликат поста

`src/content/posts/ds4-deepseek-v4-flash-coding-agent.md` — это untracked файл, который остался от первого draft'а. Корректное содержимое уже скопировано в `src/content/posts/local-coding-agent.md`. Удалить:

```bash
rm src/content/posts/ds4-deepseek-v4-flash-coding-agent.md
```

---

## 3. Прогнать тесты и typecheck локально

```bash
pnpm typecheck    # должен быть зелёным после pnpm install
pnpm test         # vitest, должно быть зелёным
pnpm lint         # eslint + prettier
```

Ожидаемые результаты:
- В `src/lib/content/frontmatter.test.ts` — 6 новых кейсов на `stripLeadingFrontmatter` (всего ≈10).
- В `src/actions/posts.upsert.test.ts` — 16 новых кейсов на схему.
- В `src/lib/markdown/external-links.test.ts` — 7 кейсов на `externalLinkPolicy`.

Если `pnpm typecheck` показывает 4 pre-existing ошибки (`MediaPage.tsx`, `MediaPicker.tsx`, `PostList.tsx`, `progress.ts`) — они в main, не из моего diff'а. Игнорировать в этом PR.

---

## 4. Перевести RU → EN для починенного поста

```bash
pnpm translate
# регенерирует src/content/posts/en/local-coding-agent.md
```

После этого `pnpm translate:check` (тот, что в CI) должен пройти.

---

## 5. Серия conventional-commit'ов

Делай **по одному коммиту за смысл**, не сваливай в один. У тебя в working tree много несвязанных правок (skills, AGENTS.md, publish.ts и т.д.) — те не трогаем, только мои файлы.

```bash
# ── Коммит 1: dep ────────────────────────────────────────────
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add rehype-external-links"

# ── Коммит 2: внешние ссылки ────────────────────────────────
git add astro.config.ts src/lib/markdown/external-links.ts src/lib/markdown/external-links.test.ts
git commit -m "feat(content): rehype-external-links для md и mdx, политика nofollow noopener noreferrer"

# ── Коммит 3: санитайзер body + warning ─────────────────────
git add src/lib/content/frontmatter.ts src/lib/content/frontmatter.test.ts
git commit -m "fix(admin): санитайзер ведущего YAML-фронтматтера в теле поста"

# ── Коммит 4: расширение action + sync description.max(200) ─
git add src/actions/posts.ts src/actions/posts.upsert.test.ts
git commit -m "feat(admin): summary, keywords, faq в posts.upsert + warnings; sync description.max(200)"

# ── Коммит 5: UI-форма ──────────────────────────────────────
git add src/components/admin/FrontmatterForm.tsx \
        src/components/admin/FaqEditor.tsx \
        src/components/admin/EditorShell.tsx \
        src/pages/admin/posts/new.astro \
        src/pages/admin/posts/\[slug\].astro
git commit -m "feat(admin): поля summary, keywords, FaqEditor в форме редактора + toast по warning"

# ── Коммит 6: починка файла + EN-зеркало ────────────────────
git add src/content/posts/local-coding-agent.md src/content/posts/en/local-coding-agent.md
# (если ds4-deepseek-...md был в индексе — он уже rm'ом удалён, попадёт сюда же)
git commit -m "fix(content): починка фронтматтера local-coding-agent + EN regen"

# ── Коммит 7: документация ──────────────────────────────────
git add docs/superpowers/specs/2026-05-10-admin-post-editor-frontmatter-fix.md \
        docs/superpowers/plans/2026-05-10-admin-post-editor-frontmatter-fix-handoff.md
git commit -m "docs(admin): spec + handoff по фиксу редактора и SEO"
```

Если файлы из `git status` я где-то не упомянул — сверься с моим списком в §6 ниже и добавь только их в один из вышеуказанных коммитов по смыслу.

---

## 6. Полный список изменённых файлов

**Modified:**
- `astro.config.ts`
- `package.json`
- `pnpm-lock.yaml` (после `pnpm install`)
- `src/actions/posts.ts`
- `src/components/admin/EditorShell.tsx`
- `src/components/admin/FrontmatterForm.tsx`
- `src/content/posts/local-coding-agent.md`
- `src/content/posts/en/local-coding-agent.md` (после `pnpm translate`)
- `src/lib/content/frontmatter.test.ts`
- `src/lib/content/frontmatter.ts`
- `src/pages/admin/posts/[slug].astro`
- `src/pages/admin/posts/new.astro`

**Added:**
- `docs/superpowers/specs/2026-05-10-admin-post-editor-frontmatter-fix.md`
- `docs/superpowers/plans/2026-05-10-admin-post-editor-frontmatter-fix-handoff.md`
- `src/actions/posts.upsert.test.ts`
- `src/components/admin/FaqEditor.tsx`
- `src/lib/markdown/external-links.test.ts`
- `src/lib/markdown/external-links.ts`

**Deleted:**
- `src/content/posts/ds4-deepseek-v4-flash-coding-agent.md` (дубликат)

---

## 7. Push + PR

```bash
git push -u origin feat/admin-post-editor-frontmatter-fix
gh pr create --base main --title "feat(admin): summary/faq/keywords + body sanitizer + rehype-external-links" --body-file docs/superpowers/plans/2026-05-10-admin-post-editor-frontmatter-fix-handoff.md
```

Если `gh pr create` не настроен — создай PR через web UI на GitHub, заголовок и body возьми из этого же файла (раздел §8).

---

## 8. PR-описание (для вставки в GitHub)

```markdown
## Что и зачем

Опубликованный пост `/blog/local-coding-agent` показывал YAML-блок
(`faq:`, `tags:`, `cover:`) плоским текстом в теле статьи, без TL;DR и без
карточки-обложки. Корневая причина: админка не имела полей
`summary`/`keywords`/`faq`, и не санитизировала body на ведущий
YAML-фронтматтер. Параллельно подключаем `rehype-external-links` для SEO
внешних ссылок.

## Закрытые acceptance criteria

- [x] Через админку можно заполнить `summary` (60–280), `keywords`,
      `faq` (массив `{question, answer}`).
- [x] Если в теле есть ведущий `---…---` блок — он вырезается на
      сервере, юзер видит toast «убрал YAML-блок из тела».
- [x] `description.max(200)` синхронизирован между `posts.upsert` и
      `src/content.config.ts`.
- [x] Внешние ссылки получают `rel="nofollow noopener noreferrer"
      target="_blank"`. Внутренние (`/`, `#`, `artka.dev`, `mailto:`,
      `tel:`) не трогаются.
- [x] Опубликованный `local-coding-agent.md` починен: один корректный
      frontmatter, чистое тело без YAML.
- [x] Vitest покрывает: `stripLeadingFrontmatter` (6 кейсов), Zod-схему
      `posts.upsert` (16 кейсов), политику `externalLinkPolicy` (7
      кейсов).
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test` зелёные.

## Файлы

См. §6 в `docs/superpowers/plans/2026-05-10-admin-post-editor-frontmatter-fix-handoff.md`.

## Что осталось вне scope

- Drag-and-drop reorder в `FaqEditor` — отдельный спринт.
- Markdown-preview FAQ-ответов.
- Авто-генерация `summary` из тела через Haiku.
- CI-чек на дубли фронтматтера в существующих постах (как Vitest-only suite).

## Скриншоты (TODO к ревью)

- [ ] до/после на `/blog/local-coding-agent` (TL;DR + FAQ + обложка
      возвращаются после ребилда).
- [ ] скрин формы админки `/admin/posts/local-coding-agent` с тремя
      новыми полями.
```

---

## 9. После мержа

- На главной (`/`) после следующего билда появятся теги `deepseek`
  и `apple-silicon` — автоматически, через `groupPostsByTag`. Никакого
  ручного шага не нужно.
- В рендере любого поста все внешние ссылки автоматически получат
  `rel`/`target` атрибуты — без правок в самих md-файлах.
- В JSON-LD каждого поста с FAQ появится узел `FAQPage` (это
  существовало и раньше — но теперь админка наконец заполняет `faq`,
  а не теряет его).

---

## 10. Если что-то пошло не так

**`pnpm install` падает на разрешениях:** проверь, что ты на своей
машине, не в Cowork-сэндбоксе. На локальной машине pnpm проблем не
имеет.

**`pnpm typecheck` ругается на новые типы:** подтяни `@types/hast`
если нужен — но я специально использовал структурный тип
(`HastAnchorLike`), чтобы не пришлось.

**После пуша Astro билд падает на содержимом `local-coding-agent.md`:**
проверь, что в файле ровно одна пара `---` в начале (frontmatter) и
никаких `---` подряд внутри YAML. Скопируй с
`feat/admin-post-editor-frontmatter-fix` HEAD, не из работающей копии.
