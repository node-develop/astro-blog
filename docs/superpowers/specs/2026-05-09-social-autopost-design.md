# Social Autopost — design

**Date:** 2026-05-09
**Status:** Draft (pending user review)
**Owner:** dev@artka.dev

## Goal

Когда статья в блоге публикуется (`src/actions/publish.ts:56` `publish.one` → `commitSha` ОК), автоматически генерируются три черновика для соц-сетей: **X-EN, LinkedIn-EN, Telegram-RU**. Черновики попадают на ревью в `/admin/social`, где владелец редактирует и публикует per-channel. Конвейер: Writer → Editor → Critic. Цель — снизить трение публикации и при этом не потерять авторский голос.

## Non-goals

- Backfill уже опубликованных статей (если понадобится — отдельный CLI `pnpm social:backfill`).
- Планировщик отложенной публикации («через 3 часа»). Только immediate-on-click.
- Multi-image / carousel / video. Только `cover` из frontmatter.
- Cross-posting на несколько X-аккаунтов (один EN-аккаунт).
- Аналитика охвата / лайков (X read-API дорогой).
- Кросс-перевод между языками («RU из EN-черновика»). Каждый канал генерится напрямую из исходной статьи.
- Editor / Critic prompts через UI. Промпты живут в git, правятся PR-ами.
- Threaded LinkedIn / Telegram. Только X-треды.
- Multi-tenancy. Один админ-editor.

## Current-state snapshot (2026-05-09)

| Слой | Состояние |
|---|---|
| `publish.one` action | `src/actions/publish.ts:56–146`. Идемпотентный коммит на GitHub. **Хуков после успеха нет** — чистое поле. |
| Контентная схема | `src/content.config.ts`. Frontmatter постов: `title, summary, body, tags, lang, pubDate, cover, sourceHash`. Соц-полей нет. |
| БД | `src/lib/db/schema.ts`: `users, sessions, accounts, postsMeta, postRevisions, mediaAssets, courseProgress`. Outbox-таблицы нет. |
| i18n | `scripts/translate.ts` + `src/lib/translate/claude.ts`. Haiku 4.5 + SHA256-кеш. EN-twin живёт в `src/content/posts/en/`. Паттерн переиспользуем. |
| Admin guard | `src/middleware.ts` защищает `/admin/*` для роли `admin|editor`. Готов под новую страницу. |

Всё новое аккуратно добавляется без правок существующего, кроме одного хука в `publish.one`.

## Architecture overview

```
┌─ Admin (Astro SSR + middleware admin-guard) ──────────────────────┐
│  /admin/posts/[slug]                                              │
│    [Publish] → publish.one ─────────── commit OK ─────┐           │
│  /admin/social             ←──────── статусы из БД ───┤           │
│  /admin/social/[postSlug]    DraftCard×3 (client:idle)│           │
└───────────────────────────────────────────────────────┘           │
                                                                    │
                            ┌── tx: insert 3 'generating' rows ─────┤
                            │   с новым sourceHash; помечаем        │
                            │   старые '(slug,channel)' как         │
                            │   'superseded' где hash ≠ new         │
                            ▼                                       │
                ┌─ src/actions/socialDrafts.ts ─┐                   │
                │  generate(slug)               │                   │
                │  void runPipeline(...)        │                   │
                └──────────────┬─────────────────┘                  │
                               ▼                                    │
   ┌── src/lib/social/writers/ ──────────┐                          │
   │  writeXEn / writeLiEn / writeTgRu  │  Haiku 4.5 (parallel)     │
   │  чистые функции, Result<Draft>      │                          │
   └──────────────┬──────────────────────┘                          │
                  ▼                                                 │
   ┌── src/lib/social/editors/ ──────────┐  voice card cached:      │
   │  editXEn / editLiEn / editTgRu     │  • voice/profile.md      │
   │  переписать в авторский голос       │  • voice/examples.json    │
   └──────────────┬──────────────────────┘  • banned-phrases.json    │
                  ▼                          • policy/{x,li,tg}.md   │
   ┌── src/lib/social/critic.ts ─────────┐  Sonnet 4.6, read-only    │
   │  runCritic(article, drafts[])       │  → CriticNote[] per draft │
   └──────────────┬──────────────────────┘                          │
                  ▼                                                 │
              ┌── socialPosts UPDATE → 'pending' ──┐                │
              └────────────────┬───────────────────┘                │
                               ▼                                    │
              UI: per-channel [Edit] [Publish] [Skip] [↻Re-check]   │
                               │                                    │
                               ▼ (publish click)                    │
   ┌── src/lib/social/clients/ ──────────┐                          │
   │  xClient.postTweet / postThread    │                          │
   │  linkedinClient.postShare          │                          │
   │  telegramClient.sendMessage        │                          │
   └──────────────┬──────────────────────┘                          │
                  ▼                                                 │
       socialPosts → 'sent' + externalUrl  /  'failed' + retry      │
                                                                    ┘
```

### Принципы

- **Функциональный стиль обязателен** (`CLAUDE.md`): никаких `class`/`extends`/`this`. Writer/Editor/Critic — это функции (`runWriter(deps, input): Promise<Result<Draft>>`), не объекты.
- **Изоляция модулей.** Writers ничего не знают про БД и сеть. Clients ничего не знают про LLM. Actions — оркестрация.
- **Транзакционная durability.** Любая запись в `socialPosts` идёт в pg-транзакции до старта LLM-вызовов.
- **Идемпотентность через sourceHash.** Та же RU-статья → тот же hash → пере-генерация невозможна без правки контента.
- **Один внешний сервис: Anthropic.** Соц-API — прямые fetch-вызовы. Никакой n8n, BullMQ, Redis.

## Components

### 1. Outbox-таблица `socialPosts`

```ts
// src/lib/db/schema.ts (additions)
export const socialChannel = pgEnum("social_channel", ["x_en", "li_en", "tg_ru"]);

export const socialStatus = pgEnum("social_status", [
  "generating",   // pipeline в полёте
  "pending",      // черновик готов, ждёт ревью
  "sending",      // вызов API в полёте
  "sent",         // успех + externalUrl
  "failed",       // упало после retry; нужно вмешательство
  "superseded",   // перезаписан новой генерацией (hash изменился)
  "skipped",      // редактор отказался публиковать
]);

export const socialPosts = pgTable("social_posts", {
  id:             uuid("id").defaultRandom().primaryKey(),
  postCollection: text("post_collection").notNull(),       // "posts"
  postSlug:       text("post_slug").notNull(),
  channel:        socialChannel("channel").notNull(),
  status:         socialStatus("status").notNull().default("generating"),

  body:           text("body").notNull().default(""),
  threadTail:     jsonb("thread_tail").$type<string[] | null>(),  // только для x_en
  mediaUrl:       text("media_url"),

  criticAnnotations: jsonb("critic_annotations").$type<CriticNote[]>(),

  generationModel: text("generation_model"),   // "claude-haiku-4-5-20251001"
  editorModel:     text("editor_model"),       // "claude-sonnet-4-6"
  criticModel:     text("critic_model"),
  sourceHash:      text("source_hash").notNull(),

  externalId:      text("external_id"),
  externalUrl:     text("external_url"),
  sentAt:          timestamp("sent_at", { withTimezone: true }),
  errorMessage:    text("error_message"),
  retryCount:      integer("retry_count").notNull().default(0),

  createdById:    text("created_by_id").references(() => users.id),
  approvedById:   text("approved_by_id").references(() => users.id),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ix_social_post_slug").on(t.postCollection, t.postSlug),
  index("ix_social_status").on(t.status),
  uniqueIndex("ux_social_active_per_channel")
    .on(t.postCollection, t.postSlug, t.channel)
    .where(sql`status NOT IN ('superseded', 'skipped', 'failed')`),
]);

export type CriticNote =
  | { severity: "block"; kind: "fact"; message: string; span?: [number, number] }
  | { severity: "block"; kind: "policy"; message: string; tag?: string }
  | { severity: "warn";  kind: "tone"; message: string; span?: [number, number] }
  | { severity: "warn";  kind: "length"; message: string };
```

Migration: одна миграция `pnpm db:generate && pnpm db:migrate`. Rollback тривиален (`DROP TABLE socialPosts; DROP TYPE …`).

### 2. Хук в `publish.one`

В `src/actions/publish.ts` после `commitSha` ОК и при `SOCIAL_DRAFTS_ENABLED=true`:

```ts
import { generateSocialDrafts } from "./socialDrafts.js";

// inside publish.one handler, после успешного коммита:
if (env.SOCIAL_DRAFTS_ENABLED) {
  await context.callAction(generateSocialDrafts, { slug, collection });
  // generateSocialDrafts возвращает быстро после INSERT'ов, LLM крутится в void
}
```

`callAction` — Astro 5 паттерн server-to-server вызова action'а с теми же middleware/context. Возвращает быстро (после транзакции INSERT'ов), сама генерация LLM — в `void runPipeline()` внутри action'а.

### 3. Action `socialDrafts.generate`

```ts
// src/actions/socialDrafts.ts (skeleton)
export const generateSocialDrafts = defineAction({
  accept: "json",
  input: z.object({ slug: z.string(), collection: z.literal("posts") }),
  handler: async ({ slug, collection }, ctx) => {
    requireRole(ctx, ["admin", "editor"]);
    const article = await loadArticle(slug, collection);
    const sourceHash = sha256(article.title + article.body + JSON.stringify(article.frontmatter));

    const channels = decideChannels(article);  // ['x_en', 'li_en', 'tg_ru'] или подмножество (см. locale-mismatch)

    await db.transaction(async (tx) => {
      await tx.update(socialPosts)
        .set({ status: "superseded", updatedAt: new Date() })
        .where(and(
          eq(socialPosts.postCollection, collection),
          eq(socialPosts.postSlug, slug),
          ne(socialPosts.sourceHash, sourceHash),
          notInArray(socialPosts.status, ["sent", "sending"]),
        ));
      for (const channel of channels) {
        await tx.insert(socialPosts)
          .values({ postCollection: collection, postSlug: slug, channel, sourceHash, status: "generating", createdById: ctx.locals.user.id })
          .onConflictDoNothing();  // если уже есть активный с тем же hash — пропускаем
      }
    });

    void runPipeline({ article, sourceHash, channels, slug, collection })
      .catch((err) => log.error({ err, mod: "social", slug }, "pipeline crashed"));

    return { ok: true, channels };
  },
});
```

Recovery — отдельный CLI-скрипт `pnpm social:recover` (`scripts/social-recover.ts`), запускается из системного cron в docker-контейнере (например, `*/5 * * * *`). Никакого in-process scheduler'а в Astro-runtime. Идемпотентен:
- `WHERE status='generating' AND createdAt < now() - interval '10 min'` → `status='failed'`, `errorMessage='generation timed out'`
- `WHERE status='sending'    AND updatedAt < now() - interval '5 min' AND externalId IS NULL` → `status='pending'`, `retryCount++`. Если `externalId IS NOT NULL` (внешний API успел принять до крэша) — оставляем `sending` для ручного разбора.

### 4. Pipeline (`runPipeline`)

```ts
async function runPipeline(deps: { article: Article; sourceHash: string; channels: SocialChannel[]; slug: string; collection: string }) {
  // Stage 1: parallel writers
  const drafts = await Promise.all(deps.channels.map(async (ch) => {
    const r = await runWriter(ch, deps.article);
    return [ch, r] as const;
  }));

  // Stage 2: parallel editors (передают voice card)
  const edited = await Promise.all(drafts.map(async ([ch, draftR]) => {
    if (!draftR.ok) return [ch, draftR] as const;
    const r = await runEditor(ch, deps.article, draftR.value);
    return [ch, r] as const;
  }));

  // Stage 3: single critic, видит все 3 черновика
  const validDrafts = edited.flatMap(([ch, r]) => r.ok ? [{ channel: ch, draft: r.value }] : []);
  const critique = await runCritic(deps.article, validDrafts);

  // Persist
  for (const [ch, r] of edited) {
    if (r.ok) {
      await db.update(socialPosts).set({
        body: r.value.body,
        threadTail: r.value.threadTail ?? null,
        mediaUrl: r.value.mediaUrl,
        criticAnnotations: critique[ch] ?? [],
        generationModel: WRITER_MODEL,
        editorModel: EDITOR_MODEL,
        criticModel: CRITIC_MODEL,
        status: "pending",
        updatedAt: new Date(),
      }).where(and(
        eq(socialPosts.postSlug, deps.slug),
        eq(socialPosts.channel, ch),
        eq(socialPosts.sourceHash, deps.sourceHash),
        eq(socialPosts.status, "generating"),
      ));
    } else {
      await db.update(socialPosts).set({
        status: "failed",
        errorMessage: stringifyError(r.error),
        updatedAt: new Date(),
      }).where(and(
        eq(socialPosts.postSlug, deps.slug),
        eq(socialPosts.channel, ch),
        eq(socialPosts.sourceHash, deps.sourceHash),
        eq(socialPosts.status, "generating"),
      ));
    }
  }
}
```

### 5. Writers (`src/lib/social/writers/`)

Чистые функции, по одной на канал. Сигнатура единая:

```ts
type WriterContext = { article: Article };
type Draft = { body: string; threadTail?: string[]; mediaUrl: string | null };
type Writer = (ctx: WriterContext) => Promise<Result<Draft>>;
```

- `writeXEn(ctx)` — Haiku 4.5, structured output через tool `emit_draft` со схемой `{ type: 'single', body } | { type: 'thread', parts: [string, ...string[]] }`. Промпт даёт правило: треды только 8–12 (не 2–4 — это AI-сигнатура).
- `writeLiEn(ctx)` — Haiku 4.5, обязательная AI-disclosure в первых 1–2 строках, 3–5 PascalCase hashtags в конце. Длина 1300–1900.
- `writeTgRu(ctx)` — Haiku 4.5, MarkdownV2 (escape валидируется отдельной функцией перед записью), 200–600 chars, ведущий emoji + `**bold**` хук.

Параллелизм: `Promise.all` с `concurrency: 3` (для нашего объёма достаточно). Article body обрезается до 3000 chars + summary, чтобы стоимость была predictable.

### 6. Editors (`src/lib/social/editors/`)

Те же 3 функции. Sonnet 4.6. Получают на вход:
- статью (как Writer)
- draft от соответствующего Writer'а
- voice card (cached prefix)

Задача: переписать draft в авторский голос. Сохранить `type` (single vs thread у X), общую структуру и AI-disclosure, но переписать формулировки. Выход тот же `Draft`.

**Voice card** (cached system block, `cache_control: ephemeral`):
- `src/lib/social/voice/profile.md` — рукописный, ~80–150 строк. Bootstrap через `pnpm voice:draft` (one-shot Sonnet-проход по корпусу постов → draft → ручная правка → коммит).
- `src/lib/social/voice/examples.json` — **3–5 hand-curated пар** «article-snippet → ideal-draft» per channel. Закоммичены, стабильный prefix. **Никакого random sampling.**
- `src/lib/social/voice/banned-phrases.json` — фразы и regex-паттерны для EN/RU LLM-штампов. Расширяемый.
- `src/lib/social/voice/policy/{x,li,tg}.md` — per-channel policy rules (engagement-bait для X, hashtag-discipline для LI, MarkdownV2 для TG).

Editor читает все из них в кэшированный prefix.

### 7. Critic (`src/lib/social/critic.ts`)

Одна функция `runCritic(article, drafts[]): Promise<Record<SocialChannel, CriticNote[]>>`. Sonnet 4.6, ОДИН вызов на batch (не per channel — даёт критику возможность видеть consistency между черновиками).

Структурированный вывод через tool `emit_critique`. Критик ТОЛЬКО аннотирует, не переписывает. Чек-листы:

1. **Fact**: каждое числовое утверждение / цитата / название продукта присутствует в исходной статье? Если нет → `block fact`.
2. **Policy** (per-channel из `voice/policy/{channel}.md`):
   - X-EN: нет engagement-bait, нет confidential данных, нет «get rich quick» тональности.
   - LI-EN: AI-disclosure обязателен. Если отсутствует → `{kind:'policy', tag:'ai-disclosure', severity:'block'}`. Если есть — нет note. Хэштеги 3–5, PascalCase. Нет ALL-CAPS заголовков.
   - TG-RU: валидный MarkdownV2 (отдельный валидатор `src/lib/social/markdown-v2.ts`), нет фальшивых CTA.
3. **Tone**: совпадение с `banned-phrases.json` (фразы и regex). Каждое — `warn tone` со span'ом.
4. **Length**: соответствие диапазону платформы → `warn length`.

### 8. Clients (`src/lib/social/clients/`)

Чистые fetch-обёртки. Никаких SDK (избегаем bloat и устаревания).

- `xClient.ts` — Twitter API v2: `POST /2/tweets`, OAuth 2.0 PKCE Bearer. `postThread(parts)` — последовательно с `reply.in_reply_to_tweet_id`, sleep 1500ms между. Refresh token при 401.
- `linkedinClient.ts` — LinkedIn Posts API: `POST /rest/posts` (НЕ deprecated UGC API), header `LinkedIn-Version: 2026-01`, scope `w_member_social`. Refresh token при 401.
- `telegramClient.ts` — Telegram Bot API 9.5: `POST /bot{token}/sendMessage` или `sendPhoto` если `mediaUrl`. `parse_mode: "MarkdownV2"`, `chat_id: TELEGRAM_CHANNEL_ID`. `disable_web_page_preview: true` если есть mediaUrl.

Все возвращают `Result<{ id: string; url: string }>`. Retry-логика — в обёртке `withRetry()`, не внутри клиентов.

### 9. Action `socialDrafts.publish`

```ts
export const publishSocialDraft = defineAction({
  input: z.object({ id: z.string().uuid(), force: z.boolean().default(false) }),
  handler: async ({ id, force }, ctx) => {
    requireRole(ctx, ["admin", "editor"]);

    // Идемпотентный переход pending → sending
    const [row] = await db.update(socialPosts)
      .set({ status: "sending", approvedById: ctx.locals.user.id, updatedAt: new Date() })
      .where(and(
        eq(socialPosts.id, id),
        eq(socialPosts.status, "pending"),
      ))
      .returning();
    if (!row) throw new ActionError({ code: "CONFLICT", message: "Draft is not in publishable state" });

    if (!force && hasBlockAnnotations(row.criticAnnotations)) {
      // откат и просим явный force
      await db.update(socialPosts).set({ status: "pending" }).where(eq(socialPosts.id, id));
      throw new ActionError({ code: "BAD_REQUEST", message: "Block-level critic notes; resubmit with force=true" });
    }

    const result = await sendByChannel(row);  // withRetry внутри
    if (result.ok) {
      await db.update(socialPosts).set({
        status: "sent",
        externalId: result.value.id,
        externalUrl: result.value.url,
        sentAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(socialPosts.id, id));
    } else {
      await db.update(socialPosts).set({
        status: "failed",
        errorMessage: stringifyError(result.error),
        retryCount: row.retryCount + 1,
        updatedAt: new Date(),
      }).where(eq(socialPosts.id, id));
    }
    return result;
  },
});
```

Дополнительно: `regenerateSocialBatch({ slug })`, `recheckCritic({ id })`, `skipDraft({ id, reason })`, `saveDraft({ id, body, threadTail })`.

### 10. Admin UI

Маршруты под middleware admin-guard:

- `src/pages/admin/social/index.astro` — SSR-список батчей, агрегаты статусов, фильтр.
- `src/pages/admin/social/[postSlug].astro` — SSR-страница с тремя `<DraftCard client:idle channel postSlug initialDraft criticNotes />`.
- React-остров `src/components/admin/DraftCard.tsx` — локальный state, debounce-save (800мс) через `Astro.callAction(saveDraft, ...)`, кнопки Publish/Skip/Re-check, тред-редактор для X.

Подробности UX и mock'ов: см. design memo, секция 4 (зафиксированы внутри code review этой фичи).

### 11. Errors (`src/lib/social/errors.ts`)

```ts
export type SocialError =
  | { kind: "generation"; stage: "writer" | "editor" | "critic"; channel: SocialChannel; cause: unknown }
  | { kind: "transport";  channel: SocialChannel; status: number; retryable: boolean; body: string }
  | { kind: "policy";     channel: SocialChannel; reason: string }   // 401/403/token revoked
  | { kind: "content";    channel: SocialChannel; reason: string };  // 422

export type Result<T> = { ok: true; value: T } | { ok: false; error: SocialError };
export const ok  = <T>(value: T): Result<T>     => ({ ok: true,  value });
export const err = (error: SocialError): Result<never> => ({ ok: false, error });

export const generationError = (stage: GenerationStage, channel: SocialChannel, cause: unknown): SocialError =>
  ({ kind: "generation", stage, channel, cause });
// ...
```

Никаких `class` / `extends`. Discriminated union + factory-функции. Boundary в Astro Action конвертирует `error.kind` в `ActionError`.

## Data flow / lifecycle

Один post:

```
draft → publish.one ──tx──► [3 generating rows, sourceHash=H]
                       │
                       ▼ (void runPipeline)
                  Writers parallel ──┐
                                     ▼
                  Editors parallel ──┐
                                     ▼
                       Critic (one batch call)
                                     │
                                     ▼
                       UPDATE → 'pending', criticAnnotations
                                     │
                              user reviews in /admin/social
                                     │
                       click [Publish] → action publishSocialDraft
                                     │
                       UPDATE pending → sending (atomic, RETURNING)
                                     │
                       sendByChannel() with retry
                                     │
                          ┌──────────┴──────────┐
                          ▼                     ▼
                    'sent' + url            'failed' + msg
```

Re-публикация той же статьи (правка + новый publish):
- Новый `sourceHash` ≠ старый.
- В транзакции старые `(slug, channel)` `pending|generating|approved|sending` → `superseded` для `hash != new`. `sent` остаются как historical record.
- Новые 3 `generating` со свежим hash.

Удаление статьи (если когда-нибудь): не каскадим. `pending|generating` → `skipped`. `sent` остаются.

Locale-mismatch (RU без EN-twin):
- `decideChannels(article)` проверяет наличие `src/content/posts/en/{slug}.md`.
- Если EN-twin отсутствует → возвращает `['tg_ru']`. Для `x_en`/`li_en` строки **не создаются**. На странице `/admin/social/[postSlug]` показывается плашка: «EN twins не готовы — запусти `pnpm translate` и нажми [Generate EN drafts]».
- Кнопка `[Generate EN drafts]` вызывает тот же `generateSocialDrafts({ slug, channels: ['x_en','li_en'] })` (action принимает опциональный `channels: SocialChannel[]` параметр для частичной генерации).

## Configuration

```bash
# .env
SOCIAL_DRAFTS_ENABLED=false      # feature flag, по умолчанию off

ANTHROPIC_API_KEY=sk-ant-...

X_CLIENT_ID=...
X_CLIENT_SECRET=...
X_OAUTH_TOKEN=...
X_OAUTH_REFRESH=...
X_HANDLE=artka

LINKEDIN_ACCESS_TOKEN=...
LINKEDIN_REFRESH_TOKEN=...
LINKEDIN_PERSON_URN=urn:li:person:...

TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHANNEL_ID=@artka_blog
```

OAuth — одноразово через CLI: `pnpm social:auth:x` / `pnpm social:auth:linkedin` (печатают URL, читают callback code, пишут токены в `.env`). `validateSocialEnv()` проверяет Zod-схему при старте, печатает warning при отсутствии (не fail).

Models:
```ts
const WRITER_MODEL = "claude-haiku-4-5-20251001";
const EDITOR_MODEL = "claude-sonnet-4-6";
const CRITIC_MODEL = "claude-sonnet-4-6";
```

## Cost model

| Этап | Модель | Tokens (rough) | $/article |
|---|---|---|---|
| 3× Writer | Haiku 4.5 | 3k in / 500 out each | $0.005 |
| 3× Editor | Sonnet 4.6 | 4k in / 600 out each | $0.045 |
| 1× Critic | Sonnet 4.6 | 6k in / 800 out | $0.05 |
| **Total** | | | **~$0.10** |

Кэш voice card (~3k cached tokens) даёт скидку до **~$0.05** на статью при последовательной публикации.
При 10 статьях/мес: $0.5–1.0 LLM + $0.1 X API ≈ **$1/мес**.

## Reliability

| Сценарий | Поведение |
|---|---|
| LLM упал в Writer/Editor | Retry 1× с backoff 2с. Если повторно — `status='failed'`, `errorMessage` |
| LLM упал в Critic | Сохраняем drafts с `criticAnnotations: []`, `status='pending'` + warning «Critic skipped» |
| Транспорт 5xx / 429 | Retry до 3× с экспоненциальным backoff + jitter (2с, 5с, 13с), уважаем `Retry-After`. `retryCount++` |
| Транспорт 4xx (≠ 429) | НЕ retry, `failed` |
| 401/403 / token revoked | НЕ retry, `failed` с подсказкой `"Run pnpm social:auth:{channel}"` |
| 422 (content invalid) | `pending` с critic block-note (не failed) |
| Двойной клик Publish | `UPDATE … RETURNING` атомарно — второй клик ничего не апдейтит, UI показывает «уже отправляется» |
| Процесс умер во время `generating` | Recovery cron через 10мин → `failed`, кнопка Regenerate в UI |
| Процесс умер во время `sending` | Recovery cron через 5мин: если `externalId IS NULL` → `pending` + `retryCount++` (можно безопасно retry). Если `externalId IS NOT NULL` (внешний API успел принять до крэша) — оставляем `sending` навсегда, требуется ручной разбор оператором (заполнить `externalUrl`, поставить `sent`) |
| Anthropic outage | Все Generation → `failed`. Блог в git, ничего не теряется. Retry вручную |

## Observability

Pino через `src/lib/logger.ts`, structured, всегда с тегом `mod: 'social'`:

```ts
log.info({ mod: 'social', stage: 'writer', channel, postSlug, durationMs, tokensIn, tokensOut, cacheReadTokens }, 'writer ok');
log.warn({ mod: 'social', stage: 'transport', channel, status: 429, retryCount }, 'rate-limited');
log.error({ mod: 'social', stage: 'transport', channel, err: serializeError(err) }, 'transport failed');
```

Body черновиков truncate до 200 chars в логах (PII/privacy hygiene); полный body — только в БД.

Будущая аналитика — отдельный `socialMetricsDaily` retro-fit.

## Testing

| Уровень | Что | Стек |
|---|---|---|
| Unit | Writers / Editors / Critic с recorded fixtures Anthropic; clients с msw; banned-phrases regexp; MarkdownV2 escape; Drizzle queries | Vitest + msw |
| Integration | Action-уровень: generate (idempotency, sourceHash, durability), publish (5xx retry, 422→block) | Vitest + Postgres в Docker (текущая инфра) |
| E2E | Один happy path + один error path. Соц-API замоканы msw в Playwright | Playwright |

**Не тестируем в CI:** реальные вызовы Anthropic / X / LI / TG. Никогда. Токены прода не попадают в CI.

`pnpm social:smoke` — локальный скрипт, генерирует drafts на любой статье, печатает в stdout, ничего не пишет в БД.

`pnpm test --update-fixtures` — обновляет recorded responses Anthropic при изменении промптов (запускается на dev-машине).

## Cutover

1. Миграция применена, `socialPosts` пустая.
2. `voice/profile.md` написан (через `pnpm voice:draft` → ручная правка → коммит).
3. `voice/examples.json`, `banned-phrases.json`, `policy/{x,li,tg}.md` закоммичены.
4. OAuth: `pnpm social:auth:x`, `pnpm social:auth:linkedin`. Telegram bot создан, добавлен в канал админом, токен в `.env`.
5. `SOCIAL_DRAFTS_ENABLED=false` в проде.
6. На staging/dev — `=true`. Публикуем тестовый пост с `draft=true` (не уходит на сайт). Проверяем UI и аннотации.
7. В prod выкатываем флаг, делаем первую реальную публикацию, ревьюим, жмём Publish per channel.
8. Через 5 публикаций — оцениваем качество, правим promts/banned-phrases по необходимости.

Rollback: `SOCIAL_DRAFTS_ENABLED=false`. Существующие `pending`/`failed` строки остаются в БД (никаких внешних побочных эффектов нет до `[Publish]`).

## Alternatives considered

| Вариант | Почему не выбран |
|---|---|
| **n8n + webhook** | +внешний сервис в инфре, секреты в двух местах, workflow вне git. Для одного триггера и < 100 постов/мес — лишнее |
| **BullMQ + Redis** | +Redis в инфре. PG outbox + recovery cron достаточно для нашего объёма |
| **pg-boss** | Хорошая альтернатива (одна зависимость, Postgres backend). Не выбран из-за overhead для 10 постов/мес — встроенная очередь усложняет дебаг и тесты. Возможный апгрейд позже |
| **Single-LLM, 4 outputs** | Кодовая простота, но один промпт = один компромисс. Для разных платформ нужны разные подходы; Per-channel writer + общий Critic дешевле в долгом периоде |
| **Без Editor стадии** | Critic читает `voice/profile.md` тоже мог бы переписывать. Но Critic должен быть read-only по принципу разделения «creator / auditor». Editor — explicit slot for voice rewriting |
| **Random RU posts as few-shot** | Ломает `cache_control: ephemeral`. Hand-curated `examples.json` стабилен и калиброван |
| **`body: jsonb [{text, order}]` для всех каналов** | Полиморфизм усложняет валидацию. `body text` + `threadTail jsonb (только x_en)` — простая дискриминация по `channel` |
| **Auto-publish all 4 без review** | Risk LinkedIn AI-policy + риск странного поста на личный аккаунт. Draft-with-review безопаснее |
| **Cron-based scheduling** | YAGNI для v1. Immediate publish решает |

## Open questions (не блокируют v1)

- Стоит ли сохранять **раскадровку версий** черновика для retrospective?
- **Заметка от Editor'а** (одна строка: «изменил тон на разговорный») для UI?
- Будет ли смысл добавить **Mastodon / Bluesky**?
- Нужен ли **email-нотификатор** при `failed` (через resend)?

## Security

- Токены — только `.env` / docker secrets / CI secrets. Никогда в БД.
- `validateSocialEnv()` на старте.
- `requireRole(ctx, ["admin","editor"])` во всех action'ах.
- Body черновиков truncate в логах.
- Ни один внешний URL не открывается без CSRF-токена Astro Actions.
- `cover.src` mediaUrl ограничен whitelist'ом доменов (`artka.dev`, `cdn.artka.dev`).

## Risks

| Риск | Вероятность | Митигация |
|---|---|---|
| LinkedIn dampens AI-disclosed posts | Mid | Compare reach over 3 публикаций. Если деградация >50% — manual-only для LI |
| X API цены/политики меняются | Mid | XClient изолирован. $/мес pre-у-ровень. Мониторим квартально |
| OAuth refresh падает молча | Mid | Recovery cron + email при `errorMessage LIKE '%OAuth%'` (mini-PR после v1) |
| Critic пропускает фактическую ошибку | Low | Двойной заслон: warn + ручной ревью. Никогда не skip-review |
| Voice profile «съезжает» | Low | profile.md ревизуется раз в квартал |
| MarkdownV2 escape ломается на edge-кейсах | Low | 30+ unit-tests, fail-fast на стороне клиента |
| Идемпотентность race | Low | Atomic `UPDATE … RETURNING` |
| Высокая стоимость на длинных статьях | Low | Body обрезается до 3000 chars в Writer/Editor |
| Anthropic outage | Mid (rare) | `status='failed'`, retry button. Блог в git'е |
| AI-сигнатура утекает несмотря на Editor | High at start | Banned-phrases расширяется по обнаружению. Через 5–10 публикаций калибруется |

## Success metrics (30 days post-launch)

- Block-аннотаций на батч (3 канала): < 1 в среднем.
- Доля символов, изменённых руками после Editor'а: < 30%.
- Время от commit публикации до Publish первого канала: < 5 минут.
- LLM cost: $0.5–1.5/мес. Если > $3 — отлаживаем prompt size / cache hits.
