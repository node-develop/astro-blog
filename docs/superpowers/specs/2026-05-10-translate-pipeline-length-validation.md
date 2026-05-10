# Spec: translate-пайплайн — длина полей EN после перевода

**Дата:** 2026-05-10
**Триггер:** билд упал в CI на `pnpm build` со схемной ошибкой:

```
[InvalidContentEntryDataError] posts → en/claude-md-12-rules data does not match collection schema.
description: String must contain at most 200 character(s)
Location: /app/src/content/posts/en/claude-md-12-rules.md:0:0
```

RU-источник `claude-md-12-rules.md` опубликовался через админку нормально
(description там 175 символов). EN-файл сгенерирован `pnpm translate` —
после перевода Haiku 4.5 description в EN превысил 200 символов, и
Astro content sync развалил билд.

---

## 1. Корневые причины (несколько, накладываются)

### 1.1. Truncation в `translate.ts` есть только для `description`

В `scripts/translate.ts`, функция `serializeWithExtras` (строки ~44–49):

```ts
const truncateDesc = (s: string): string => {
  if (s.length <= 200) return s;
  const cut = s.slice(0, 200).lastIndexOf(" ");
  return s.slice(0, cut > 100 ? cut : 200);
};
```

Это единственное место, где длина EN-полей корректируется. Защиты нет
для:

- `summary` — лимит 60..280 в content schema
- `faq[].question` — 5..200
- `faq[].answer` — 20..2000
- `coverAlt` — без жёсткого лимита, но ОК

То есть если Haiku вернёт summary 320 символов — пройдёт сериализацию,
лежит в EN-файле, билд развалится. Этого инцидента сейчас не было
(ошибка про description), но риск регулярный.

### 1.2. Truncation в `serializeWithExtras` сработала и не помогла

Функция корректно режет по word boundary до ≤ 200. То, что описание в
финальном EN-файле > 200, означает один из сценариев:

1. **Haiku вернула description заметно длиннее RU**, и truncate сработал
   на word boundary, но **финальная длина всё равно осталась чуть выше
   200** — теоретически невозможно (математически `slice(0, 200)` всегда
   ≤ 200). Если такое наблюдается — баг в truncate. Проверить unit-тестом
   на 250-символьной строке без пробелов в первых 200.
2. **EN-файл был отредактирован руками после translate** — `manuallyEdited:
   true`, описание длиннее 200, decideAction вернул `skip`/`warn`, файл
   не пересобрался скриптом.
3. **EN-файл был сгенерирован раньше (старая версия translate.ts) и не
   перегенерировался**: `decideAction` вернул `skip` потому что
   `sourceHash` совпал; truncate не применился к старому файлу.

Какой именно сценарий — установить чтением файла
`src/content/posts/en/claude-md-12-rules.md` на ветке, которая попала
в CI.

### 1.3. `translate-check.ts` не валидирует контент против Zod-схемы

`scripts/translate-check.ts` (читал целиком — 70 строк) проверяет только:

- наличие EN-twin для каждого RU,
- совпадение `sourceHash` между RU и EN.

Он **не парсит EN-файлы через Zod-схему `posts` collection**. Поэтому
файл с description > 200 проходит `pnpm translate:check` и падает уже на
билде. Это и есть тот «лишний шаг» — должна быть единая шлюзовая
валидация, которая ловит проблему до Docker-билда.

### 1.4. Translation prompt не передаёт ограничения

В `src/lib/translate/claude.ts`, `SYSTEM_PROMPT_STRINGS` (строки 20–26)
не сообщает модели лимиты: «description не более 200 символов»,
«summary 60..280», «faq.question ≤ 200». Haiku пытается перевести
буквально и часто расширяется на 10–30 % в EN относительно RU.

Передача лимитов в системный промпт — самый дешёвый рычаг, который
снижает количество retry на post-translation truncation.

---

## 2. Acceptance criteria

- [ ] EN-файл `claude-md-12-rules.md` починен: description ≤ 200,
      summary ≤ 280, FAQ Q ≤ 200, FAQ A ≤ 2000.
- [ ] Билд `pnpm build` проходит локально и в CI.
- [ ] `scripts/translate.ts` применяет truncation/валидацию ко всем
      переводимым полям с длиновыми лимитами: `description`, `summary`,
      `coverAlt`, `faq[].question`, `faq[].answer`.
- [ ] `src/lib/translate/claude.ts` `SYSTEM_PROMPT_STRINGS` принимает
      опциональный per-key constraints map (`{description: {max: 200},
      summary: {min: 60, max: 280}}`) и передаёт его в Haiku.
- [ ] При повторном превышении лимита после перевода — automatic retry
      (до 2 раз) с в промпте «previous output was N chars, must be ≤ M».
      После retry — truncation как fallback.
- [ ] `scripts/translate-check.ts` (или новый `scripts/translate-validate.ts`,
      см. §3) **парсит каждый EN-файл через Zod-схему `posts` collection**
      и валит CI с понятным сообщением, какое поле какой длины
      превысило лимит. До `pnpm build`.
- [ ] CI workflow (`.github/workflows/ci.yml`) запускает новую
      валидацию **до** `pnpm build`.
- [ ] Vitest-покрытие: edge case truncate (200-символьная строка без
      пробелов; строка ровно 200; строка 280 для summary; FAQ A
      на 2050 — обрезается до ≤ 2000).
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` зелёные.

---

## 3. Разбивка по командам агентов

Порядок: `architect → critic → backender → critic`.

### 3.1. `architect` — проектирование (1 проход)

**Вход:** этот spec целиком + чтение `scripts/translate.ts`,
`scripts/translate-check.ts`, `src/lib/translate/claude.ts`,
`src/content.config.ts` (collection `posts`), CI workflow.

**Задачи:**

1. Решить, где живёт **единый источник правды по длиновым лимитам**:
   - вариант А: вытащить лимиты из Zod-схемы `posts` programmatically
     через `_def`/`shape` (DRY, но завязано на Zod internals);
   - вариант Б: отдельный модуль `src/lib/content/limits.ts` с
     константами, которые **импортятся в `content.config.ts`** и в
     `translate.ts`/`actions/posts.ts` — три потребителя. Документировать
     в комментарии что это синхронизирующий модуль.
   - Выбрать вариант Б (рекомендация архитектуры — explicit constants
     лучше чем introspection Zod-internals; этот подход уже звучал в
     CLAUDE.md как «синхронизация лимитов между posts.upsert и
     content.config.ts»).
2. Решить формат **constraints map для translation prompt**: per-field
   `{min?: number, max: number}`. Прокидывать в `translateStrings` как
   опциональный аргумент `constraints?: Record<string, {min?: number,
   max: number}>`.
3. Решить retry-policy: 2 повтора, каждый с явным указанием в промпте
   «previous attempt was N chars for field X, must be ≤ M». После
   2 неудачных — truncate fallback с warning в stderr.
4. Решить **где жить content-валидации**: расширить `translate-check.ts`
   или создать `translate-validate.ts`. Рекомендация: расширить
   существующий `translate-check.ts` — там уже есть инфраструктура чтения
   EN-файлов и dirift-проверка; добавить второй проход через Zod.

**Выход:** `docs/superpowers/plans/2026-05-10-translate-pipeline-length-validation.md`,
короткие решения по 1–4. Под 400 слов.

### 3.2. `critic` (быстрый прогон)

Прогнать план architect-а на overengineering, нарушения CLAUDE.md
(никаких `class`/`this`, никакого `any`), на ясность retry-policy.

### 3.3. `backender` — реализация

#### 3.3.1. Извлечь лимиты в один модуль

Файл: **`src/lib/content/limits.ts`** (новый):

```ts
export const POST_LIMITS = {
  title: { min: 3, max: 120 },
  description: { min: 10, max: 200 },
  summary: { min: 60, max: 280 },
  keywords: { itemMin: 1, itemMax: 80, max: 40 },
  faqQuestion: { min: 5, max: 200 },
  faqAnswer: { min: 20, max: 2000 },
  faqMax: 20,
} as const;
```

Импортировать из:

- `src/content.config.ts` — заменить хардкоды в `defineCollection.schema`
  на `POST_LIMITS.*`.
- `src/actions/posts.ts` — то же в Zod-схеме `postUpsertInput`.
- `scripts/translate.ts` — для truncation и для constraints в prompt.

Сразу удалить устаревшие комментарии «Synced with content.config.ts» —
теперь синхронизация проверяется компиляцией.

#### 3.3.2. Расширить truncation в `translate.ts`

В `serializeWithExtras` или (лучше) в новой функции `clampToLimits(meta:
Frontmatter): Frontmatter`:

- `description` обрезать как сейчас (word-boundary до 200);
- `summary` обрезать аналогично до 280; **дополнительно** проверить min
  60 — если перевод вышел < 60 символов, оставить RU `summary` (она по
  определению ≥ 60) с warning «EN summary < 60 chars after translation,
  reused RU». Это редкий кейс, но защита нужна.
- `coverAlt` — без длины, ничего;
- `faq[].question` — обрезать до 200 (на word boundary);
- `faq[].answer` — обрезать до 2000.

После truncation — обязательно вернуть `Frontmatter` с пройденным
`POST_LIMITS` контрактом. Иначе бросать explicit Error с указанием
поля и финальной длины.

#### 3.3.3. Передать constraints в translation prompt

Файл: **`src/lib/translate/claude.ts`**.

- Расширить `TranslateStringsInput` опциональным полем `constraints?:
  Record<string, { min?: number; max: number }>`.
- Если `constraints` есть — добавить в `SYSTEM_PROMPT_STRINGS` блок:
  «Length constraints for output values (in characters):\n- description:
  max 200\n- summary: 60..280\n- ...».
- В user-message при retry прикреплять разницу: «previous attempt for
  field X was N chars, but must be M chars max — please tighten».

#### 3.3.4. Retry-policy

В `translateStrings`:

- После получения JSON ответа — прогнать через ту же `clampToLimits`-шку
  для словаря строк.
- Если хоть одно поле over-limit:
  - retry (1) с расширенным промптом «previous output exceeded limits
    on fields [...], please return shorter values».
  - retry (2) с ещё более явным указанием.
  - после 2 — truncate fallback и `console.warn` со списком полей.
- Тип возвращаемого результата не меняется — string-словарь, который
  гарантированно укладывается в лимиты.

#### 3.3.5. Расширить `translate-check.ts` content-валидацией

Файл: **`scripts/translate-check.ts`**.

После существующего drift-чека (если drift найден — пишем как сейчас и
выходим с 1) — **второй проход**: для каждого существующего EN-файла
загрузить frontmatter и попытаться разпарсить через Zod-схему из
`src/content.config.ts`. На ошибку — печатать:

```
✗ EN content schema violation in <slug>:
   - description: 247 chars (max 200)
   - summary: 312 chars (max 280)
```

Если хоть один EN-файл не прошёл — exit 1.

#### 3.3.6. Тесты

Файл: **`scripts/__tests__/translate-truncation.test.ts`** (новый):

- 200-символьная строка без пробелов — truncate возвращает ≤ 200
- 250-символьная строка с пробелом на 245 — обрезается до 245
- summary 320 — обрезается до ≤ 280
- summary 50 — warning + используется RU (mock)
- FAQ Q 250 — обрезается до 200
- FAQ A 2050 — обрезается до 2000

Файл: **`scripts/__tests__/translate-check-content-validation.test.ts`**:

- EN-файл с description 250 → exit 1, понятное сообщение
- EN-файл с summary 50 → exit 1, понятное сообщение
- Все EN-файлы валидны → exit 0

#### 3.3.7. CI workflow

Файл: **`.github/workflows/ci.yml`**.

Добавить шаг до `pnpm build`:

```yaml
- name: Validate EN translations
  run: pnpm translate:check
```

Если `translate:check` уже там — убедиться, что он использует расширенную
версию (с content-валидацией). Если нет — добавить.

### 3.4. `critic` (финальный)

Diff-ревью по чек-листу:

- никакого `class`/`this`/`any` в новом коде;
- POST_LIMITS импортятся в трёх потребителях, нет хардкодов лимитов
  (grep `200` в translate.ts должен находить только импорт и комментарии);
- retry-policy не блокирует пайплайн навсегда (max 2 retries,
  таймаут);
- truncate всегда возвращает строку, длина которой ≤ заявленному max;
- pnpm-lock.yaml не нужен (новых deps нет).

---

## 4. Immediate fix (вне команды агентов)

До запуска большой работы по архитектуре — починить опубликованный
файл, чтобы CI прошёл:

```bash
cd ~/astro-blog
# Проверить EN-файл, нашёл ли translate sourceHash от текущего RU
cat src/content/posts/en/claude-md-12-rules.md | head -20

# Вариант 1: переводы устарели — пересобрать с force
pnpm translate -- --force claude-md-12-rules

# Вариант 2: EN был manually edited — открыть руками
#   src/content/posts/en/claude-md-12-rules.md
# Подрезать description до ≤ 200, summary до ≤ 280

# Прогнать локально
pnpm typecheck && pnpm build
```

Если **`pnpm translate -- --force claude-md-12-rules`** регенерирует
EN-файл и описание всё ещё > 200 — это значит truncate в `serializeWithExtras`
не сработал; см. §1.2 — баг внутри truncateDesc, который надо отдельно
воспроизвести unit-тестом.

---

## 5. Что закоммитить итогом

- `src/lib/content/limits.ts` (новый)
- `src/content.config.ts` (импорт `POST_LIMITS`)
- `src/actions/posts.ts` (импорт `POST_LIMITS`)
- `scripts/translate.ts` (импорт `POST_LIMITS`, новая `clampToLimits`)
- `src/lib/translate/claude.ts` (constraints в prompt + retry)
- `scripts/translate-check.ts` (Zod-валидация EN)
- `scripts/__tests__/translate-truncation.test.ts` (новый)
- `scripts/__tests__/translate-check-content-validation.test.ts` (новый)
- `.github/workflows/ci.yml` (если не было — шаг `pnpm translate:check`
  до `pnpm build`)
- `src/content/posts/en/claude-md-12-rules.md` — починенная версия
  (regen или ручная правка)

Conventional commits, по одной логической единице:

- `refactor(content): вытащить POST_LIMITS в один модуль`
- `fix(translate): truncate всех полей с лимитами + retry с constraints в промпте`
- `feat(ci): translate:check валидирует EN через Zod-схему до build`
- `test(translate): edge cases truncation`
- `fix(content): починка en/claude-md-12-rules после перевода`

---

## 6. Out of scope (отдельные spec'ы)

- LaTeX/Markdown поведение при truncation на word-boundary посреди
  inline-code или ссылки — пока приемлемо обрезать как есть, но если
  будет инцидент — отдельный спек.
- Параллельный перевод нескольких файлов — сейчас последовательно,
  пока не критично.
- Каталог типичных длин EN ↔ RU для разных языковых пар — interesting,
  но избыточно.
