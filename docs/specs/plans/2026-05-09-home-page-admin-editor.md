# План: редактирование главной страницы в админке (RU/EN)

**Статус:** approved with changes (4 раунда architect ↔ critic).
**Scope:** A2 + Б1 + В2 + R-FINAL-1 + R-FINAL-2.
**Спека:** см. раздел 1 ниже (sysanalyst v1, расширенный решениями).

---

## Архитектурные решения (зафиксировано пользователем)

- **A2.** Контент главной живёт в `src/content/site/home.md` (RU) и `src/content/site/en/home.md` (EN). НЕ в `strings.*.json`.
- **Б1.** RU-first. EN — производная через `pnpm translate site home` или кнопку «Translate to EN». `manuallyEdited:true` защищает ручные правки EN.
- **В2.** Одинаковый набор полей для RU и EN форм.
- **R-FINAL-1.** Единственный источник истины = `home.md`. Никаких sync со `strings.json` в action. `landing-pages.ts` переписывается на `getEntry`.
- **R-FINAL-2.** warn-toast путь — `HomeEditor.handleSaveRu` вызывает `actions.translate.one` напрямую (не через `maybeAutoTranslate` в `PublishBar`), читает `result.data.status === "warned"` и показывает toast.

---

## Список 14 полей frontmatter `home.md`

Производные ровно от ключей `home.*` и `meta.home.*` в `src/i18n/strings.ru.json`.

| frontmatter | strings.ru.json | тип | required |
|---|---|---|---|
| `heroEyebrow` | `home.eyebrow` | string | optional |
| `heroTitle` | `home.heroTitle` | string | **required** (min 1) |
| `heroLede` | `home.heroLede` | string (multiline) | optional |
| `heroCta` | `home.cta` | string | optional |
| `courseEyebrow` | `home.courseEyebrow` | string | optional |
| `courseTitle` | `home.courseTitle` | string | optional |
| `courseLede` | `home.courseLede` | string (multiline) | optional |
| `courseCta` | `home.courseCta` | string | optional |
| `latestLabel` | `home.latestLabel` | string | optional |
| `authorLabel` | `home.author.label` | string | optional |
| `authorBio` | `home.author.bio` | string (multiline) | optional |
| `authorLinksAria` | `home.author.linksAria` | string | optional |
| `metaTitle` | `meta.home.title` | string | **required** (min 1, max 120) |
| `metaDescription` | `meta.home.description` | string (multiline) | **required** (min 10, max 200) |

Плюс служебные: `title` (для совместимости с site schema), `sourceHash` (string optional), `manuallyEdited` (boolean default false).

`heroCta` и `courseCta` — плоские строки. `href` зашит в `index.astro` как роутинг (`/blog`, `/courses/claude-code-guide`), не редактируется.

`tags.title` остаётся в `strings.json` (используется на `/tags`, `/en/tags`, в OG `tags`-landing).

---

## Шаги реализации (19)

### Backend (backender)

1. **Аудит read-only.** grep по проекту:
   - `t(locale,"home\.` и `t(locale,"meta\.home\.` в `src/`.
   - `entry.data.description` и `entry.data.title` в `src/lib/og/`, `src/components/`, `src/pages/`.
   - `allLandingMeta(` в `src/` (см. правка C-1).
   - `HomeAuthorCard` callsites (см. правка M-1).
   - тесты с моками `home.*` (см. правка M-11).
   Отчёт прикладывается к PR.

2. **Расширить Zod schema `site`** в `src/content.config.ts`. Добавить 14 опциональных string-полей точно по таблице выше.

3. **Расширить `SCHEMAS.site.stringFields`** в `src/lib/translate/translate-one.ts`. Список 14 ключей. Гард `typeof v === "string"` сохраняет совместимость с about/now/uses (golden T-4).

4. **Создать RU `src/content/site/home.md`** с frontmatter из 14 полей + `title: "Главная"`. **Body — пустая строка**. Latest posts и HomeTopics остаются runtime-данными в `index.astro`.

5. **Запустить `pnpm translate site home`** локально. Закоммитить EN twin `src/content/site/en/home.md` в тот же PR.
   - **Правка M-2/M-3:** до запуска проверить `extractProse("")` и `decideAction(existingEn:null)` — путь "translate" работает; `translateProse` имеет guard для `placeholders.length===0` (или добавить).

6. **Создать `src/actions/home.ts`** — `home.update`:
   - Input Zod: 14 полей с **корректным required/optional** (см. правка M-6 и таблицу полей).
   - Normalize: `""` → `undefined` для **опциональных** полей; для required — Zod min-валидация.
   - `if (locale === "en") frontmatter.manuallyEdited = true` server-side.
   - Atomic tmp+rename в той же директории (`writeHomeToDisk` хелпер в `src/lib/content/write-home.ts`).
   - Никаких patches в strings.json.
   - Merge-семантика: переданные поля обновляют, остальные сохраняются (см. правка N-3 — тест T-2b).

7. **Guard в `src/actions/site.ts`**:
   ```ts
   if (input.slug === "home") throw new ActionError({ code: "BAD_REQUEST", message: "Use home.update for the home page" });
   ```

### Frontend (frontender)

8. **Redirect 308** в `src/pages/admin/site/[slug].astro`:
   ```ts
   if (Astro.params.slug === "home") return Astro.redirect("/admin/home", 308);
   ```

9. **Фильтр** home из списка `src/pages/admin/site/index.astro` + карточка-ссылка «Главная страница» → `/admin/home`.

10. **Создать `src/components/admin/HomeEditor.tsx`** (React island, `client:load`):
    - Tabs RU → EN.
    - 14 полей в каждой табе (4 textarea для multiline + 10 input).
    - **handleSaveRu**: `actions.home.update({locale:"ru",...})` → `actions.translate.one({collection:"site", slug:"home"})` → если `result.data.status === "warned"` → toast «⚠️ EN отмечен как отредактированный вручную, перевод пропущен. Используйте кнопку ⟳ для перезаписи.».
    - **handleSaveEn**: только `actions.home.update({locale:"en",...})`.
    - Badge «🔒 Защищено от автоперевода» на EN-табе при `enManuallyEdited === true` (server-side props).
    - **Правка M-5:** info-баннер на EN-табе: «Чтобы вернуться к авто-синхронизации с RU — нажмите ⟳ Force в PublishBar».
    - Один `<PublishBar collection="site" slug="home">` под табами.

11. **Создать `src/pages/admin/home.astro`** (`prerender = false`). `getEntry("site","home")` + `getEntry("site","en/home")`. Передать `data` обеих локалей + `enManuallyEdited` в HomeEditor.

12. **Переписать `src/lib/og/landing-pages.ts`**:
    - Убрать `home.courseTitle`, `meta.home.title` из `TITLE_KEYS`.
    - Сделать `allLandingMeta` async.
    - Читать через `getEntry("site","home"|"en/home")`.
    - **Правка C-1, C-2:** перед изменением signature — grep callsites и обновить под `await`. Убедиться, что все callsites в Astro-runtime (если найдутся standalone Node-скрипты — читать через `fs` напрямую).
    - `tags.title` остаётся в strings (для других landing).

13. **Миграция `src/pages/index.astro`** — заменить `t(locale,"home.*")` и `t(locale,"meta.home.*")` на `homeFrontmatterSchema.parse(getEntry("site","home").data)`. Props в HomeAuthorCard / HomeTopics required без t()-fallback.

14. **Миграция `src/pages/en/index.astro`** — аналогично, `getEntry("site","en/home")`.

15. **Миграция `HomeAuthorCard.astro` и `HomeTopics.astro`**:
    - HomeAuthorCard: required props `{label, bio, linksAria}: { label: string; bio: string; linksAria: string }`. Убрать `t(locale,"home.author.*")`.
    - HomeTopics: НЕ трогать, `tags.title` остаётся.
    - **Правка M-1:** проверить все callsites HomeAuthorCard (grep) — обновить пропсы везде.

### Финал (sequential)

16. **Очистка strings**: удалить из `src/i18n/strings.ru.json` и `strings.en.json` ключи: `home.eyebrow`, `home.cta`, `home.courseEyebrow`, `home.courseTitle`, `home.courseLede`, `home.courseCta`, `home.latestLabel`, `home.heroTitle`, `home.heroLede`, `home.author.label`, `home.author.bio`, `home.author.linksAria`, `meta.home.title`, `meta.home.description`. **НЕ трогать** `tags.title`.
   - **Правка C-3:** `pnpm typecheck` обязателен между шагом 15 и 16.
   - **Правка M-4:** уточнить, что делает `pnpm translate` со strings-hashes — orphan keys в `.strings.hashes.json` либо удаляются автоматически, либо нужен manual cleanup.

17. **Тесты:**
    - Unit T-1 round-trip; T-2 update RU heroTitle (НЕ пишет в strings); **T-2b merge-semantics** (правка N-3); T-3 EN manuallyEdited override; T-4 golden about/now/uses; T-5 empty body translate; T-6 site.update home → BAD_REQUEST; T-7 parse live файлов.
    - Integration I-1 `allLandingMeta()` после миграции.
    - E2e E-1..E-6 (save flow, warn toast, manuallyEdited override, badge, force, 308 redirect).

18. **Performance check**: `pnpm build && pnpm preview`, warm 10 раз `curl /`, `autocannon -d 30 -c 10 http://localhost:4321/`. Регресс p95 <50ms — OK; иначе **Plan B** (SSG `/` + `repository_dispatch` после `publish.one` → `redeploy.yml`, latency 2-3 мин до прода). Записать оба числа в PR.

19. **Документация** в `CLAUDE.md`:
    > Главная редактируется только через `/admin/home`. Контент — `src/content/site/home.md` + `en/home.md`. Ключи `home.*` и `meta.home.*` удалены из strings.{ru,en}.json. `tags.title` остаётся в strings (используется на `/tags`).

---

## Файлы

**Создать:**
- `src/content/site/home.md`
- `src/content/site/en/home.md` (через `pnpm translate`)
- `src/actions/home.ts`
- `src/lib/content/write-home.ts`
- `src/lib/content/home-schema.ts` (homeFrontmatterSchema, KEY_ORDER)
- `src/components/admin/HomeEditor.tsx`
- `src/pages/admin/home.astro`
- `tests/unit/actions/home.test.ts`
- `tests/unit/translate/site-schema.test.ts`
- `tests/unit/content/home-schema.test.ts`
- `tests/integration/og/landing-pages.test.ts`
- `tests/e2e/admin-home.spec.ts`

**Редактировать:**
- `src/content.config.ts`
- `src/lib/translate/translate-one.ts`
- `src/actions/site.ts`
- `src/actions/index.ts`
- `src/pages/admin/site/[slug].astro`
- `src/pages/admin/site/index.astro`
- `src/lib/og/landing-pages.ts`
- `src/pages/index.astro`
- `src/pages/en/index.astro`
- `src/components/HomeAuthorCard.astro`
- `src/i18n/strings.ru.json`
- `src/i18n/strings.en.json`
- `CLAUDE.md`

---

## Open refinements (8 точечных правок до старта или по ходу)

| ID | Где | Что |
|---|---|---|
| C-1 | шаг 12 | grep `allLandingMeta(` и обновить все callsites под `await` |
| C-2 | шаг 12 | если callsites вне Astro-runtime — читать `home.md` через `fs` |
| C-3 | между 15 и 16 | `pnpm typecheck` гейт перед удалением strings |
| M-1 | шаг 15 | grep `HomeAuthorCard` callsites — обновить пропсы везде |
| M-2/M-3 | шаг 5 | подтвердить `extractProse("")` и `decideAction(null)`; добавить guard для пустых placeholders если нет |
| M-4 | шаг 16 | проверить, удаляет ли `pnpm translate` orphan keys в `.strings.hashes.json` |
| M-5 | шаг 10 | info-баннер «Force ⟳ снимает manuallyEdited» в EN-табе |
| M-6 | шаг 6 | required vs optional в Zod-input — точная таблица (см. список полей) |
| N-3 | шаг 17 | T-2b merge-semantics (передать только heroTitle → остальные не стираются) |

---

## Definition of Done

- [ ] Все 19 шагов выполнены, коммиты атомарные.
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm translate:check` — зелёные.
- [ ] T-1..T-7, T-2b, I-1, E-1..E-6, P-1 присутствуют.
- [ ] `grep '"home\.' src/i18n/strings.{ru,en}.json` — пусто.
- [ ] `grep '"meta\.home\.' src/i18n/strings.{ru,en}.json` — пусто.
- [ ] `grep -r 't(locale, *"home\.' src/` — пусто.
- [ ] `grep -r 't(locale, *"meta\.home\.' src/` — пусто.
- [ ] `landing-pages.ts` использует `getEntry`, не `t()` для home/meta.home полей.
- [ ] Визуальное сравнение `/` и `/en/` до/после — pixel-equal (скриншот в PR).
- [ ] `/admin/home` ручной smoke: load, save RU, save EN, warn-toast, badge, force-overwrite, 308 redirect.
- [ ] `gitnexus_detect_changes()` — зона эффекта совпадает с планом.
- [ ] PR содержит baseline + после p95-числа.

---

## История ревизий

- **v1** (sysanalyst+architect+critic) — rework: 5 critical, 7 major. Главные: site.update затирает frontmatter, EN-таба vs translate-pipeline, landing-pages.ts ссылки.
- **v2** (architect) — rework: 3 critical (race condition auto-translate, EN cold start, R3/R4 inconsistency).
- **v3** (architect) — rework: галлюцинированные имена полей, body=динамика, warn-path не разрешён.
- **v4** (architect, после R-FINAL-1 + R-FINAL-2) — **approved with changes**: 8 точечных правок (без структурных изменений).
