# Social Autopost — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** При публикации статьи автоматически генерировать черновики соц-постов для X-EN, LinkedIn-EN, Telegram-RU через конвейер Writer → Editor → Critic, складывать в outbox-таблицу и предоставлять админ-UI для ревью и публикации per-channel.

**Architecture:** Custom Astro Actions + Drizzle outbox + Anthropic SDK. Functional style (без `class`/`extends`/`this`), `Result<T>`-возвраты, discriminated-union ошибки. Транзакционная durability: строки `socialPosts` создаются ДО старта LLM-вызовов, recovery-cron подбирает зависшие. Hand-curated voice card (profile.md + examples.json) для стабильного prompt cache. Feature flag `SOCIAL_DRAFTS_ENABLED` для cutover.

**Tech Stack:** Astro 5 (SSR + Actions), Drizzle ORM + Postgres 18, Better-Auth (admin guard), Anthropic SDK (Claude Haiku 4.5 + Sonnet 4.6), Vitest + msw (unit/integration), Playwright (e2e), pino (logging), Tailwind 4 + React island для DraftCard.

**Spec:** `docs/superpowers/specs/2026-05-09-social-autopost-design.md`

---

## File Structure

### New files

```
src/
├── actions/
│   ├── socialDrafts.ts                    # generate / publish / save / skip / recheck / regenerate
│   └── _social.ts                         # shared helpers (loadArticle, sourceHash)
├── lib/
│   ├── social/
│   │   ├── types.ts                       # SocialChannel, Draft, CriticNote, etc.
│   │   ├── errors.ts                      # SocialError, Result<T>, ok/err/factories
│   │   ├── config.ts                      # WRITER_MODEL, EDITOR_MODEL, CRITIC_MODEL, validateSocialEnv
│   │   ├── markdown-v2.ts                 # Telegram MarkdownV2 escape + validate
│   │   ├── retry.ts                       # withRetry helper (5xx/429 backoff+jitter)
│   │   ├── pipeline.ts                    # runPipeline orchestrator
│   │   ├── critic.ts                      # runCritic
│   │   ├── voice/
│   │   │   ├── loader.ts                  # load+memoize voice card prefix
│   │   │   ├── profile.md                 # hand-written, voice rules
│   │   │   ├── examples.json              # 3-5 hand-curated few-shot pairs per channel
│   │   │   ├── banned-phrases.json        # EN+RU phrases + regex patterns
│   │   │   └── policy/
│   │   │       ├── x.md                   # X engagement-bait rules
│   │   │       ├── linkedin.md            # LinkedIn AI-disclosure / hashtag rules
│   │   │       └── telegram.md            # Telegram MarkdownV2 / CTA rules
│   │   ├── writers/
│   │   │   ├── x-en.ts                    # writeXEn (single + thread)
│   │   │   ├── linkedin-en.ts             # writeLiEn
│   │   │   └── telegram-ru.ts             # writeTgRu
│   │   ├── editors/
│   │   │   ├── x-en.ts                    # editXEn
│   │   │   ├── linkedin-en.ts             # editLiEn
│   │   │   └── telegram-ru.ts             # editTgRu
│   │   └── clients/
│   │       ├── x.ts                       # postTweet, postThread, refreshToken
│   │       ├── linkedin.ts                # postShare, refreshToken
│   │       └── telegram.ts                # sendMessage, sendPhoto
├── components/
│   └── admin/
│       ├── SocialBatchRow.astro           # row in /admin/social list
│       └── DraftCard.tsx                  # React island, per-channel editor (client:idle)
└── pages/
    └── admin/
        └── social/
            ├── index.astro                # list of batches
            └── [postSlug].astro           # 3 cards per article

scripts/
├── social-auth-x.ts                       # one-shot OAuth CLI for X
├── social-auth-linkedin.ts                # one-shot OAuth CLI for LinkedIn
├── social-recover.ts                      # recovery cron: timeout generating/sending
├── social-smoke.ts                        # local smoke-test, prints to stdout
└── voice-draft.ts                         # bootstrap voice/profile.md from RU corpus

test/
├── fixtures/
│   ├── anthropic/                         # recorded JSON responses
│   ├── articles/                          # test article markdown samples
│   └── social-api/                        # msw handlers for X/LI/TG
└── e2e/
    ├── social-flow.spec.ts                # happy path
    └── social-flow-error.spec.ts          # 401 path

drizzle/
└── NNNN_social_posts.sql                  # generated migration
```

### Modified files

- `src/lib/db/schema.ts` — add `socialChannel`, `socialStatus` enums + `socialPosts` table
- `src/actions/publish.ts` — hook `generateSocialDrafts` after successful commit (gated by feature flag)
- `package.json` — scripts: `social:auth:x`, `social:auth:linkedin`, `social:recover`, `social:smoke`, `voice:draft`
- `.env.example` — add `SOCIAL_DRAFTS_ENABLED`, `X_*`, `LINKEDIN_*`, `TELEGRAM_*` keys
- `src/middleware.ts` — verify `/admin/social` already covered (it is, under `/admin/*`)

---

## Phase 0 — Foundation (DB + types + flag)

### Task 1: Drizzle migration for `social_posts`

**Files:**
- Modify: `src/lib/db/schema.ts`
- Generate: `drizzle/<NNNN>_social_posts.sql`

- [ ] **Step 1: Add enums and table**

In `src/lib/db/schema.ts`, append after existing tables:

```ts
import { uniqueIndex, sql } from "drizzle-orm/pg-core";  // add to existing imports

export const socialChannel = pgEnum("social_channel", ["x_en", "li_en", "tg_ru"]);
export const socialStatus = pgEnum("social_status", [
  "generating",
  "pending",
  "sending",
  "sent",
  "failed",
  "superseded",
  "skipped",
]);

export const socialPosts = pgTable(
  "social_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postCollection: text("post_collection").notNull(),
    postSlug: text("post_slug").notNull(),
    channel: socialChannel("channel").notNull(),
    status: socialStatus("status").notNull().default("generating"),

    body: text("body").notNull().default(""),
    threadTail: jsonb("thread_tail").$type<string[] | null>(),
    mediaUrl: text("media_url"),

    criticAnnotations: jsonb("critic_annotations"),

    generationModel: text("generation_model"),
    editorModel: text("editor_model"),
    criticModel: text("critic_model"),
    sourceHash: text("source_hash").notNull(),

    externalId: text("external_id"),
    externalUrl: text("external_url"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").notNull().default(0),

    createdById: uuid("created_by_id").references(() => users.id),
    approvedById: uuid("approved_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: index("ix_social_post_slug").on(t.postCollection, t.postSlug),
    statusIdx: index("ix_social_status").on(t.status),
    activePerChannel: uniqueIndex("ux_social_active_per_channel")
      .on(t.postCollection, t.postSlug, t.channel)
      .where(sql`status NOT IN ('superseded', 'skipped', 'failed')`),
  }),
);

export type SocialPost = typeof socialPosts.$inferSelect;
export type NewSocialPost = typeof socialPosts.$inferInsert;
```

- [ ] **Step 2: Generate migration**

Run: `pnpm db:generate`
Expected: A new file `drizzle/NNNN_social_posts.sql` is created with `CREATE TYPE social_channel...`, `CREATE TYPE social_status...`, `CREATE TABLE social_posts...`, three indexes.

- [ ] **Step 3: Inspect SQL**

Read the generated SQL file. Verify:
- `CREATE TYPE` for both enums
- `CREATE TABLE social_posts` with correct columns
- Three indexes including `WHERE status NOT IN (...)` for `ux_social_active_per_channel`
- No `DROP` statements

If anything off — fix `schema.ts` and re-generate.

- [ ] **Step 4: Apply migration locally**

Run: `pnpm db:migrate`
Expected: Migration applied successfully.

Verify: `pnpm db:studio` → table `social_posts` visible with columns.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat(social): drizzle migration for social_posts outbox table"
```

---

### Task 2: Types module

**Files:**
- Create: `src/lib/social/types.ts`

- [ ] **Step 1: Write types**

```ts
// src/lib/social/types.ts
export type SocialChannel = "x_en" | "li_en" | "tg_ru";
export type GenerationStage = "writer" | "editor" | "critic";

export type Draft = {
  body: string;
  threadTail?: string[];     // only present (and only allowed) for x_en threads
  mediaUrl: string | null;
};

export type CriticNote =
  | { severity: "block"; kind: "fact"; message: string; span?: [number, number] }
  | { severity: "block"; kind: "policy"; message: string; tag?: string }
  | { severity: "warn"; kind: "tone"; message: string; span?: [number, number] }
  | { severity: "warn"; kind: "length"; message: string };

export type Article = {
  collection: "posts";
  slug: string;
  title: string;
  summary: string;
  body: string;                    // markdown без frontmatter
  tags: readonly string[];
  pubDate: Date;
  cover: { src: string; alt: string } | null;
  lang: "ru" | "en";
  sourceUrl: string;               // canonical https://artka.dev/blog/...
  hasEnTwin: boolean;              // true if src/content/posts/en/{slug}.md exists
};

export const ALL_CHANNELS: readonly SocialChannel[] = ["x_en", "li_en", "tg_ru"];
export const EN_CHANNELS: readonly SocialChannel[] = ["x_en", "li_en"];
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/social/types.ts
git commit -m "feat(social): channel/draft/critic types"
```

---

### Task 3: Errors module + Result type

**Files:**
- Create: `src/lib/social/errors.ts`
- Create: `test/lib/social/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/lib/social/errors.test.ts
import { describe, it, expect } from "vitest";
import { ok, err, generationError, transportError, isOk } from "~/lib/social/errors";

describe("Result type", () => {
  it("ok wraps value", () => {
    const r = ok(42);
    expect(r).toEqual({ ok: true, value: 42 });
  });

  it("err wraps error", () => {
    const e = generationError("writer", "x_en", new Error("boom"));
    const r = err(e);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("generation");
  });

  it("transportError marks retryable correctly", () => {
    const e = transportError("li_en", 503, "service unavailable");
    expect(e.retryable).toBe(true);
    const e2 = transportError("li_en", 422, "invalid");
    expect(e2.retryable).toBe(false);
  });

  it("isOk narrows the discriminant", () => {
    const r = ok("hello");
    if (isOk(r)) {
      const v: string = r.value;       // type-checks
      expect(v).toBe("hello");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/lib/social/errors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/social/errors.ts
import type { SocialChannel, GenerationStage } from "./types.js";

export type SocialError =
  | { kind: "generation"; stage: GenerationStage; channel: SocialChannel; cause: unknown }
  | { kind: "transport"; channel: SocialChannel; status: number; retryable: boolean; body: string }
  | { kind: "policy"; channel: SocialChannel; reason: string }
  | { kind: "content"; channel: SocialChannel; reason: string };

export type Result<T> = { ok: true; value: T } | { ok: false; error: SocialError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = <T = never>(error: SocialError): Result<T> => ({ ok: false, error });

export const isOk = <T>(r: Result<T>): r is { ok: true; value: T } => r.ok;
export const isErr = <T>(r: Result<T>): r is { ok: false; error: SocialError } => !r.ok;

export const generationError = (
  stage: GenerationStage,
  channel: SocialChannel,
  cause: unknown,
): SocialError => ({ kind: "generation", stage, channel, cause });

export const transportError = (
  channel: SocialChannel,
  status: number,
  body: string,
): SocialError => ({
  kind: "transport",
  channel,
  status,
  retryable: status >= 500 || status === 429,
  body,
});

export const policyError = (channel: SocialChannel, reason: string): SocialError =>
  ({ kind: "policy", channel, reason });

export const contentError = (channel: SocialChannel, reason: string): SocialError =>
  ({ kind: "content", channel, reason });

export const stringifyError = (e: SocialError): string => {
  switch (e.kind) {
    case "generation": return `[${e.stage}/${e.channel}] generation failed: ${String(e.cause)}`;
    case "transport":  return `[${e.channel}] HTTP ${e.status}: ${e.body.slice(0, 500)}`;
    case "policy":     return `[${e.channel}] policy: ${e.reason}`;
    case "content":    return `[${e.channel}] content: ${e.reason}`;
  }
};
```

- [ ] **Step 4: Run tests**

Run: `pnpm test test/lib/social/errors.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/errors.ts test/lib/social/errors.test.ts
git commit -m "feat(social): functional error model (Result + discriminated union)"
```

---

### Task 4: Feature flag and config module

**Files:**
- Create: `src/lib/social/config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write config module**

```ts
// src/lib/social/config.ts
import { z } from "zod";

export const WRITER_MODEL = "claude-haiku-4-5-20251001";
export const EDITOR_MODEL = "claude-sonnet-4-6";
export const CRITIC_MODEL = "claude-sonnet-4-6";

export const ARTICLE_BODY_TRUNCATE = 3000;

export const isSocialEnabled = (): boolean =>
  process.env.SOCIAL_DRAFTS_ENABLED === "true";

const SocialEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  X_CLIENT_ID: z.string().min(1),
  X_CLIENT_SECRET: z.string().min(1),
  X_OAUTH_TOKEN: z.string().min(1),
  X_OAUTH_REFRESH: z.string().min(1),
  X_HANDLE: z.string().min(1),
  LINKEDIN_ACCESS_TOKEN: z.string().min(1),
  LINKEDIN_REFRESH_TOKEN: z.string().min(1),
  LINKEDIN_PERSON_URN: z.string().regex(/^urn:li:person:/),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHANNEL_ID: z.string().min(1),
});

export type SocialEnv = z.infer<typeof SocialEnvSchema>;

/** Validates env. Returns Zod result; do NOT throw — caller decides what to do. */
export const validateSocialEnv = (): { ok: true; env: SocialEnv } | { ok: false; issues: string[] } => {
  const r = SocialEnvSchema.safeParse(process.env);
  if (r.success) return { ok: true, env: r.data };
  return { ok: false, issues: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
};
```

- [ ] **Step 2: Update `.env.example`**

Append to `.env.example`:

```bash
# ── Social autopost (feature flag off by default) ─────────
SOCIAL_DRAFTS_ENABLED=false

# X / Twitter API v2 (OAuth 2.0 PKCE, populate via pnpm social:auth:x)
X_CLIENT_ID=
X_CLIENT_SECRET=
X_OAUTH_TOKEN=
X_OAUTH_REFRESH=
X_HANDLE=

# LinkedIn (OAuth 2.0, populate via pnpm social:auth:linkedin)
LINKEDIN_ACCESS_TOKEN=
LINKEDIN_REFRESH_TOKEN=
LINKEDIN_PERSON_URN=

# Telegram bot (created manually; bot must be channel admin)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHANNEL_ID=
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/social/config.ts .env.example
git commit -m "feat(social): feature flag + env schema validation"
```

---

## Phase 1 — Voice card scaffolding

### Task 5: Voice card files (skeletons committed; user fills profile.md)

**Files:**
- Create: `src/lib/social/voice/profile.md` (skeleton)
- Create: `src/lib/social/voice/examples.json`
- Create: `src/lib/social/voice/banned-phrases.json`
- Create: `src/lib/social/voice/policy/x.md`
- Create: `src/lib/social/voice/policy/linkedin.md`
- Create: `src/lib/social/voice/policy/telegram.md`

- [ ] **Step 1: Write profile.md skeleton**

```markdown
<!-- src/lib/social/voice/profile.md -->
# Voice profile — Артём Кашута / artka.dev

## What I do
TypeScript engineer writing about developer tooling, AI agents in production,
functional style, infrastructure for technical blogs.

## Voice
- Direct speech, no inflation. "It lets you" → "you can".
- Often start with a counter-intuitive fact or question.
- Concrete numbers > vague qualifiers ("$5/month" beats "cheap").
- Comfortable admitting what didn't work.
- Irony in moderation; no industry-wide sarcasm.

## Vocabulary I use (RU/EN)
- "стек" not "технологический стек"
- "под капотом" not "внутри реализации"
- "сходить в БД" not "обратиться к базе данных"
- "ship" not "deploy to production"
- "wire it up" not "perform integration"

## Topics I have authority in
TypeScript, Astro, Drizzle, Postgres, Anthropic SDK, Claude Code,
functional TS, dev experience, content blogs, MDX/Mermaid.

## Topics where I do NOT make assertions
ML research, statistics, legal/tax/medical, crypto. Even if the article
touches them, tone stays descriptive.

## Opening lines I use
- "I spent three weeks..."
- "Last time I touched..."
- "The strangest thing about X is Y."

## Opening lines that drive me crazy (banned)
- "Let's dive in"
- "Have you ever wondered"
- "В современном мире..."
- "🚀 Excited to share..."
```

> **Note for the engineer:** This skeleton is a placeholder. The owner will replace it via `pnpm voice:draft` (Task 31) + manual editing before cutover. The skeleton is committed so the pipeline runs in dev/CI without missing-file errors.

- [ ] **Step 2: Write examples.json with two real-style examples per channel**

```json
{
  "x_en": [
    {
      "article_excerpt": "Three weeks of cron-based queue, then I switched to Postgres SELECT FOR UPDATE SKIP LOCKED. Five tables, zero new infra.",
      "ideal_draft": {
        "type": "single",
        "body": "I spent three weeks building a 'lightweight' cron queue before realising Postgres SKIP LOCKED would have shipped on day one.\n\nFive tables, two SELECTs, zero new infra.\n\nWhy I'd pick it over Redis for any side-project →\nartka.dev/blog/multi-agent-postgres"
      }
    },
    {
      "article_excerpt": "Building voice profiles for AI editor: hand-curated few-shots beat random sampling because of cache stability.",
      "ideal_draft": {
        "type": "thread",
        "parts": [
          "Random few-shot sampling kills your prompt cache.",
          "I learned this the boring way — debugging $40 of Anthropic spend that should have been $4.",
          "If your few-shot examples rotate, every call is a cache miss.",
          "Hand-curate 3-5 stable examples. Pin them. Cache them.",
          "The 'random for diversity' instinct is wrong here — diversity comes from the user's article, not the prompt prefix.",
          "Net effect on my voice editor pipeline: $1/mo instead of $10, and zero quality regression.",
          "Full write-up: artka.dev/blog/voice-card-cache"
        ]
      }
    }
  ],
  "li_en": [
    {
      "article_excerpt": "Three weeks of cron-based queue, then switched to Postgres SELECT FOR UPDATE SKIP LOCKED.",
      "ideal_draft": {
        "body": "This post was drafted with Claude and edited by hand.\n\nFor three months I ran a custom in-memory job queue for a side project. It mostly worked — until it didn't.\n\nThe rebuild took half a Saturday. Postgres outbox + SKIP LOCKED replaced 200 lines of cron + node-schedule with five tables and two SELECTs.\n\nWhat I learned:\n\n- 'Lightweight' usually means 'I haven't hit the failure mode yet'.\n- Postgres locks are not scary; they are a feature. SKIP LOCKED was added in 9.5 and most engineers I know still haven't tried it.\n- Reaching for Redis is a reflex; reaching for the database you already have is a habit worth building.\n\nFull write-up with the exact schema and a benchmark: artka.dev/blog/multi-agent-postgres\n\n#Postgres #FunctionalTypeScript #DevTooling #AIEngineering #SideProject"
      }
    }
  ],
  "tg_ru": [
    {
      "article_excerpt": "Три недели я писал свою «лёгкую» очередь на cron. Потом перешёл на Postgres SKIP LOCKED.",
      "ideal_draft": {
        "body": "🛢️ **Postgres вместо Redis под очередь**\n\nТри недели я писал свою «лёгкую» очередь на cron \\+ node\\-schedule\\. Потом понял, что Postgres c `SELECT FOR UPDATE SKIP LOCKED` решает то же самое за одну транзакцию\\.\n\nПять таблиц, две SELECT'а, ноль внешней инфры\\.\n\n→ artka\\.dev/blog/multi\\-agent\\-postgres"
      }
    }
  ]
}
```

- [ ] **Step 3: Write banned-phrases.json**

```json
{
  "en": {
    "phrases": [
      "delve", "delving", "leverage", "in today's fast-paced",
      "navigate the complexities", "in conclusion", "it's important to note",
      "robust solution", "transformative", "game-changer", "game changer",
      "cutting-edge", "best practices", "elevate", "embark on",
      "harness the power", "underscore", "tapestry", "intricate",
      "meticulous", "ever-evolving", "stand the test of time",
      "let's dive in", "as we look ahead", "synergy",
      "groundbreaking", "revolutionary", "seamless integration",
      "unlock the potential", "in the realm of", "shed light on",
      "🚀 Excited to share", "🚀 Thrilled to announce",
      "I'm excited to announce"
    ],
    "patterns": [
      ["It's not (just )?\\w+, it's \\w+", "AI 'not X, it's Y' parallel"],
      ["not only \\w+ but also \\w+", "'not only ... but also' overuse"]
    ]
  },
  "ru": {
    "phrases": [
      "погружаться", "погрузиться", "погружение",
      "в стремительно меняющемся мире", "в современном мире", "в эпоху",
      "ключевой аспект", "стоит отметить", "однако стоит отметить",
      "стоит признать", "более того", "таким образом", "в конечном итоге",
      "стоит подчеркнуть", "трансформирует", "переосмысливает",
      "революционный", "революционирует", "беспрецедентный",
      "под ключ", "в режиме реального времени",
      "комплексное решение", "синергия",
      "🚀 Рад поделиться", "💡 Делюсь мыслями", "✨ С удовольствием"
    ],
    "patterns": [
      ["(?:не\\s+)просто\\s+\\w+,\\s*а\\s+\\w+", "RU 'не просто X, а Y' штамп"],
      ["Это\\s+(?:позволяет|даёт\\s+возможность)", "пассивно-канцелярский оборот"]
    ]
  }
}
```

- [ ] **Step 4: Write three policy files**

`src/lib/social/voice/policy/x.md`:

```markdown
# X (Twitter) policy rules

- No engagement bait: "RT if you agree", "99% don't know", "Comment X for the link".
- No "get rich quick" or financial-result tone.
- Single tweet ≤ 270 chars (270, not 280, leaves room for link preview).
- Threads: 8 to 12 tweets only. NEVER 2-4 — that pattern is the AI signature.
- No more than 1 emoji in the lead tweet.
- No hashtags in the lead tweet (X de-prioritises lead-hashtag content).
- Acceptable: hashtags in the final tweet of a thread, or after the link in a single tweet.
- No confidential or unpublished claims.
```

`src/lib/social/voice/policy/linkedin.md`:

```markdown
# LinkedIn policy rules

- AI-disclosure REQUIRED in the first 1–2 lines (e.g. "Drafted with Claude, edited by hand.").
  This is a 2026 algorithmic signal — missing disclosure can trigger AI-content dampening.
- 1 300 ≤ length ≤ 1 900 characters.
- 3 to 5 hashtags at the end. PascalCase (`#FunctionalTypeScript`, not `#functional-typescript`).
- No ALL-CAPS headers.
- No external links in the first 100 characters (LinkedIn de-prioritises link-first posts).
- Use line breaks; avoid wall-of-text paragraphs.
```

`src/lib/social/voice/policy/telegram.md`:

```markdown
# Telegram policy rules

- MarkdownV2 only. The following characters MUST be escaped with a backslash: `_*[]()~\`>#+-=|{}.!`
  (Validation in src/lib/social/markdown-v2.ts.)
- 200 ≤ length ≤ 600 characters (excluding escapes).
- Lead with one emoji + bold hook on line 1.
- Final line: link to the article, no preview (`disable_web_page_preview=true`).
- 0 hashtags. Telegram doesn't reward them.
- No fake CTAs ("Click NOW", "Like if you agree").
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/voice/
git commit -m "feat(social): voice card scaffolding (profile.md skeleton + examples + policy)"
```

---

### Task 6: Voice loader

**Files:**
- Create: `src/lib/social/voice/loader.ts`
- Create: `test/lib/social/voice/loader.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/lib/social/voice/loader.test.ts
import { describe, it, expect } from "vitest";
import { loadVoiceCard, getChannelExamples, getBannedPhrases, getPolicy } from "~/lib/social/voice/loader";

describe("voice loader", () => {
  it("loads profile.md as text", async () => {
    const card = await loadVoiceCard();
    expect(card.profile).toContain("Voice profile");
    expect(card.profile.length).toBeGreaterThan(100);
  });

  it("returns at least 1 example per channel", async () => {
    const x = await getChannelExamples("x_en");
    const li = await getChannelExamples("li_en");
    const tg = await getChannelExamples("tg_ru");
    expect(x.length).toBeGreaterThan(0);
    expect(li.length).toBeGreaterThan(0);
    expect(tg.length).toBeGreaterThan(0);
  });

  it("returns banned phrases for both langs", async () => {
    const banned = await getBannedPhrases();
    expect(banned.en.phrases).toContain("delve");
    expect(banned.ru.phrases).toContain("погружаться");
  });

  it("returns per-channel policy text", async () => {
    expect((await getPolicy("x_en")).length).toBeGreaterThan(50);
    expect((await getPolicy("li_en")).length).toBeGreaterThan(50);
    expect((await getPolicy("tg_ru")).length).toBeGreaterThan(50);
  });

  it("memoises across calls (same reference)", async () => {
    const a = await loadVoiceCard();
    const b = await loadVoiceCard();
    expect(a).toBe(b);  // identity, not equality
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/lib/social/voice/loader.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/social/voice/loader.ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { SocialChannel } from "../types.js";

const HERE = dirname(fileURLToPath(import.meta.url));

export type VoiceCard = {
  profile: string;
  examples: VoiceExamples;
  banned: BannedPhrases;
  policy: Record<SocialChannel, string>;
};

export type VoiceExamples = {
  x_en: { article_excerpt: string; ideal_draft: { type: "single" | "thread"; body?: string; parts?: string[] } }[];
  li_en: { article_excerpt: string; ideal_draft: { body: string } }[];
  tg_ru: { article_excerpt: string; ideal_draft: { body: string } }[];
};

export type BannedPhrases = {
  en: { phrases: string[]; patterns: [string, string][] };
  ru: { phrases: string[]; patterns: [string, string][] };
};

let memo: Promise<VoiceCard> | null = null;

const POLICY_FILE: Record<SocialChannel, string> = {
  x_en: "policy/x.md",
  li_en: "policy/linkedin.md",
  tg_ru: "policy/telegram.md",
};

const load = async (): Promise<VoiceCard> => {
  const [profile, examplesRaw, bannedRaw, x, li, tg] = await Promise.all([
    readFile(join(HERE, "profile.md"), "utf8"),
    readFile(join(HERE, "examples.json"), "utf8"),
    readFile(join(HERE, "banned-phrases.json"), "utf8"),
    readFile(join(HERE, POLICY_FILE.x_en), "utf8"),
    readFile(join(HERE, POLICY_FILE.li_en), "utf8"),
    readFile(join(HERE, POLICY_FILE.tg_ru), "utf8"),
  ]);
  return {
    profile,
    examples: JSON.parse(examplesRaw),
    banned: JSON.parse(bannedRaw),
    policy: { x_en: x, li_en: li, tg_ru: tg },
  };
};

export const loadVoiceCard = (): Promise<VoiceCard> => {
  if (!memo) memo = load();
  return memo;
};

export const getChannelExamples = async <C extends SocialChannel>(channel: C): Promise<VoiceExamples[C]> => {
  const { examples } = await loadVoiceCard();
  return examples[channel];
};

export const getBannedPhrases = async (): Promise<BannedPhrases> => {
  const { banned } = await loadVoiceCard();
  return banned;
};

export const getPolicy = async (channel: SocialChannel): Promise<string> => {
  const { policy } = await loadVoiceCard();
  return policy[channel];
};

/** Test-only: clear memo. NOT exported through index. */
export const __resetForTest = () => { memo = null; };
```

- [ ] **Step 4: Run tests**

Run: `pnpm test test/lib/social/voice/loader.test.ts`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/voice/loader.ts test/lib/social/voice/loader.test.ts
git commit -m "feat(social): voice card loader with memoisation"
```

---

## Phase 2 — Markdown V2 + Retry helpers

### Task 7: MarkdownV2 escape and validate (Telegram)

**Files:**
- Create: `src/lib/social/markdown-v2.ts`
- Create: `test/lib/social/markdown-v2.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/lib/social/markdown-v2.test.ts
import { describe, it, expect } from "vitest";
import { escapeMarkdownV2, validateMarkdownV2 } from "~/lib/social/markdown-v2";

describe("MarkdownV2 escape", () => {
  it.each([
    ["a.b", "a\\.b"],
    ["foo (bar)", "foo \\(bar\\)"],
    ["1+2=3!", "1\\+2\\=3\\!"],
    ["hash # tag", "hash \\# tag"],
    ["link_text", "link\\_text"],
    ["**bold**", "**bold**"],   // markdown formatters NOT escaped
    ["*italic*", "*italic*"],
    ["[label](url)", "[label](url)"],   // link syntax NOT escaped
    ["plain text", "plain text"],
  ])("escapeMarkdownV2(%j) = %j", (input, expected) => {
    expect(escapeMarkdownV2(input)).toBe(expected);
  });
});

describe("MarkdownV2 validate", () => {
  it("passes valid escaped text", () => {
    const r = validateMarkdownV2("Hello\\, world\\! Visit artka\\.dev");
    expect(r.ok).toBe(true);
  });

  it("flags unescaped reserved char", () => {
    const r = validateMarkdownV2("Hello, world! Visit artka.dev");  // commas/dots/bang unescaped
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.length).toBeGreaterThan(0);
  });

  it("allows formatters", () => {
    const r = validateMarkdownV2("**bold** *italic* `code` [link](https://x.com)");
    expect(r.ok).toBe(true);
  });

  it("flags unbalanced bold", () => {
    const r = validateMarkdownV2("**bold");
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/lib/social/markdown-v2.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementation**

```ts
// src/lib/social/markdown-v2.ts

// Per https://core.telegram.org/bots/api#markdownv2-style, these chars must be
// escaped with a backslash unless they are part of a markdown formatter.
const RESERVED = /([_*\[\]()~`>#+\-=|{}.!\\])/g;

/**
 * Escape user text for safe insertion into MarkdownV2 outside of formatter spans.
 * Use BEFORE assembling formatted output. Formatters (`**bold**`, `*italic*`,
 * `` `code` ``, `[label](url)`) must be inserted AFTER escaping their inner content
 * separately if needed.
 */
export const escapeMarkdownV2 = (text: string): string => {
  // Naive: we walk the string and escape reserved chars EXCEPT inside well-formed
  // formatters. For our use-case (Writer emits clean text + we wrap in formatters),
  // we expose a low-level escape and a higher-level builder.
  // Here: only escape outside of `**…**`, `*…*`, `` `…` ``, `[…](…)`.

  let out = "";
  let i = 0;
  while (i < text.length) {
    // formatter spans
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) { out += text.slice(i, end + 2); i = end + 2; continue; }
    }
    if (text[i] === "*") {
      const end = text.indexOf("*", i + 1);
      if (end !== -1 && !text.startsWith("**", i)) {
        out += text.slice(i, end + 1); i = end + 1; continue;
      }
    }
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) { out += text.slice(i, end + 1); i = end + 1; continue; }
    }
    if (text[i] === "[") {
      const labelEnd = text.indexOf("]", i + 1);
      if (labelEnd !== -1 && text[labelEnd + 1] === "(") {
        const urlEnd = text.indexOf(")", labelEnd + 2);
        if (urlEnd !== -1) {
          out += text.slice(i, urlEnd + 1); i = urlEnd + 1; continue;
        }
      }
    }
    // outside any formatter — escape if reserved
    if (RESERVED.test(text[i]!)) {
      RESERVED.lastIndex = 0;  // reset stateful regex
      out += "\\" + text[i];
    } else {
      out += text[i];
    }
    i += 1;
  }
  return out;
};

/**
 * Validate that a MarkdownV2 string is well-formed:
 * - all reserved chars outside of formatter spans are escaped
 * - bold/italic/code/link spans are balanced
 */
export const validateMarkdownV2 = (text: string): { ok: true } | { ok: false; issues: string[] } => {
  const issues: string[] = [];

  // Quick balance check
  const boldOpens = (text.match(/(?<!\\)\*\*/g) ?? []).length;
  if (boldOpens % 2 !== 0) issues.push("unbalanced bold (`**`)");

  // Walk and verify no UN-escaped reserved char outside formatters
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end === -1) break;
      i = end + 2; continue;
    }
    if (text[i] === "*") {
      const end = text.indexOf("*", i + 1);
      if (end !== -1) { i = end + 1; continue; }
    }
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) { i = end + 1; continue; }
    }
    if (text[i] === "[") {
      const lblEnd = text.indexOf("]", i + 1);
      if (lblEnd !== -1 && text[lblEnd + 1] === "(") {
        const urlEnd = text.indexOf(")", lblEnd + 2);
        if (urlEnd !== -1) { i = urlEnd + 1; continue; }
      }
    }
    if ("_[](){}>#+-=|.!".includes(text[i]!)) {
      // reserved but might be already escaped (preceded by backslash)
      if (text[i - 1] !== "\\") issues.push(`unescaped reserved char "${text[i]}" at index ${i}`);
    }
    i += 1;
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
};
```

- [ ] **Step 4: Run tests**

Run: `pnpm test test/lib/social/markdown-v2.test.ts`
Expected: PASS — all tests green. If a test fails, adjust the escape walker (this is fiddly — common pitfall is the stateful `RESERVED.test()` not being reset).

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/markdown-v2.ts test/lib/social/markdown-v2.test.ts
git commit -m "feat(social): MarkdownV2 escape + validate utilities"
```

---

### Task 8: Retry helper

**Files:**
- Create: `src/lib/social/retry.ts`
- Create: `test/lib/social/retry.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// test/lib/social/retry.test.ts
import { describe, it, expect, vi } from "vitest";
import { withRetry } from "~/lib/social/retry";
import { ok, err, transportError } from "~/lib/social/errors";

describe("withRetry", () => {
  it("returns ok on first success", async () => {
    const fn = vi.fn().mockResolvedValue(ok(42));
    const r = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(r).toEqual(ok(42));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable error and eventually succeeds", async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce(err(transportError("x_en", 503, "down")))
      .mockResolvedValueOnce(err(transportError("x_en", 503, "down")))
      .mockResolvedValueOnce(ok("ok"));
    const r = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(r).toEqual(ok("ok"));
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-retryable error", async () => {
    const fn = vi.fn().mockResolvedValue(err(transportError("x_en", 422, "bad input")));
    const r = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(r.ok).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after maxAttempts", async () => {
    const fn = vi.fn().mockResolvedValue(err(transportError("x_en", 503, "down")));
    const r = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(r.ok).toBe(false);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test test/lib/social/retry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementation**

```ts
// src/lib/social/retry.ts
import type { Result } from "./errors.js";

export type RetryOpts = { maxAttempts: number; baseDelayMs: number };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const jitter = (ms: number): number => ms / 2 + Math.random() * ms;

/**
 * Retry an async fn that returns Result<T>. Retries only `transport` errors
 * with `retryable: true` (e.g. 5xx, 429). Other errors bubble up immediately.
 *
 * Backoff: exponential (base, base*2, base*4, …) + jitter.
 */
export const withRetry = async <T>(
  fn: () => Promise<Result<T>>,
  opts: RetryOpts,
): Promise<Result<T>> => {
  let last: Result<T> | null = null;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt += 1) {
    last = await fn();
    if (last.ok) return last;
    if (last.error.kind !== "transport" || !last.error.retryable) return last;
    if (attempt < opts.maxAttempts) {
      const delay = jitter(opts.baseDelayMs * 2 ** (attempt - 1));
      await sleep(delay);
    }
  }
  return last as Result<T>;
};
```

- [ ] **Step 4: Run tests**

Run: `pnpm test test/lib/social/retry.test.ts`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/retry.ts test/lib/social/retry.test.ts
git commit -m "feat(social): withRetry helper with exponential backoff + jitter"
```

---

## Phase 3 — Writers (TDD per channel)

### Task 9: Anthropic test harness

**Files:**
- Create: `test/fixtures/anthropic/index.ts`

- [ ] **Step 1: Write fixture loader + Anthropic mock**

```ts
// test/fixtures/anthropic/index.ts
import { vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const FIXT_DIR = new URL("./", import.meta.url).pathname;

/**
 * Returns a mock for `@anthropic-ai/sdk` whose `messages.create` reads
 * a recorded JSON response from test/fixtures/anthropic/<name>.json.
 *
 * Update fixtures via `pnpm test --update-fixtures` (handled separately).
 */
export const mockAnthropicWithFixture = (fixtureName: string) => {
  const path = join(FIXT_DIR, `${fixtureName}.json`);
  if (!existsSync(path)) throw new Error(`fixture not found: ${path}`);
  const response = JSON.parse(readFileSync(path, "utf8"));
  return vi.fn().mockResolvedValue(response);
};

export const writerFixture = (channel: string, scenario: string): string =>
  `writer-${channel}-${scenario}`;

export const editorFixture = (channel: string, scenario: string): string =>
  `editor-${channel}-${scenario}`;

export const criticFixture = (scenario: string): string => `critic-${scenario}`;
```

- [ ] **Step 2: Create fixture files (3 sample responses, hand-crafted to match expected schemas)**

Create `test/fixtures/anthropic/writer-x_en-happy.json`:

```json
{
  "id": "msg_test_x_en",
  "type": "message",
  "role": "assistant",
  "model": "claude-haiku-4-5-20251001",
  "content": [
    {
      "type": "tool_use",
      "id": "toolu_test",
      "name": "emit_draft",
      "input": {
        "type": "single",
        "body": "I spent three weeks on a 'lightweight' cron queue before realising Postgres SKIP LOCKED would have shipped on day one.\n\nFive tables, two SELECTs, zero new infra.\n\nartka.dev/blog/multi-agent-postgres"
      }
    }
  ],
  "stop_reason": "tool_use",
  "usage": { "input_tokens": 3000, "output_tokens": 100, "cache_read_input_tokens": 2400 }
}
```

Create `test/fixtures/anthropic/writer-li_en-happy.json` and `test/fixtures/anthropic/writer-tg_ru-happy.json` analogously (use the `examples.json` ideal_drafts as the response payload). Keep them minimal but realistic.

- [ ] **Step 3: Commit fixtures**

```bash
git add test/fixtures/anthropic/
git commit -m "test(social): Anthropic SDK fixture harness + sample writer responses"
```

---

### Task 10: writeXEn (single + thread support)

**Files:**
- Create: `src/lib/social/writers/x-en.ts`
- Create: `test/lib/social/writers/x-en.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// test/lib/social/writers/x-en.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeXEn } from "~/lib/social/writers/x-en";
import { mockAnthropicWithFixture } from "../../../fixtures/anthropic/index.js";
import type { Article } from "~/lib/social/types";

const article: Article = {
  collection: "posts",
  slug: "multi-agent-postgres",
  title: "Postgres outbox в роли очереди",
  summary: "TL;DR: SKIP LOCKED + 5 таблиц = простая очередь без Redis.",
  body: "Three weeks ago I started building...",
  tags: ["postgres", "outbox"],
  pubDate: new Date("2026-05-09"),
  cover: { src: "https://artka.dev/cover.jpg", alt: "diagram" },
  lang: "ru",
  sourceUrl: "https://artka.dev/blog/multi-agent-postgres",
  hasEnTwin: true,
};

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicWithFixture("writer-x_en-happy") },
  })),
}));

describe("writeXEn", () => {
  it("returns single-tweet draft", async () => {
    const r = await writeXEn({ article });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.body.length).toBeLessThanOrEqual(270);
      expect(r.value.threadTail ?? []).toEqual([]);
    }
  });

  it("attaches mediaUrl from cover", async () => {
    const r = await writeXEn({ article });
    if (r.ok) expect(r.value.mediaUrl).toBe("https://artka.dev/cover.jpg");
  });
});
```

> **Thread test:** Add a second fixture `writer-x_en-thread.json` with a `tool_use` whose `input.type === "thread"` and `parts: [string, string, ...]` (length 8). Add a test case mocking that fixture and asserting `r.value.threadTail.length === 7` (parts[1..]).

- [ ] **Step 2: Run, expect fail**

Run: `pnpm test test/lib/social/writers/x-en.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementation**

```ts
// src/lib/social/writers/x-en.ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { WRITER_MODEL, ARTICLE_BODY_TRUNCATE } from "../config.js";
import { generationError, ok, err } from "../errors.js";
import { loadVoiceCard } from "../voice/loader.js";
import type { Article, Draft } from "../types.js";
import type { Result } from "../errors.js";

const EmitDraftSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("single"), body: z.string().min(1).max(270) }),
  z.object({ type: z.literal("thread"), parts: z.array(z.string().min(1).max(280)).min(8).max(15) }),
]);

const TOOL = {
  name: "emit_draft",
  description: "Emit the X (Twitter) draft as either a single tweet or a thread.",
  input_schema: {
    type: "object",
    oneOf: [
      { properties: { type: { const: "single" }, body: { type: "string", maxLength: 270 } }, required: ["type", "body"] },
      { properties: { type: { const: "thread" }, parts: { type: "array", items: { type: "string", maxLength: 280 }, minItems: 8, maxItems: 15 } }, required: ["type", "parts"] },
    ],
  },
} as const;

const buildSystemBlock = async () => {
  const voice = await loadVoiceCard();
  const examples = JSON.stringify(voice.examples.x_en, null, 2);
  return `You are writing an X (Twitter) post in ENGLISH for Artem Kashuta's audience.

<HARD-RULES>
- Single tweet: ≤270 characters (270, NOT 280 — leave room for link preview).
- Threads: 8 to 12 tweets ONLY. NEVER 2-4 — that pattern is the AI signature on X.
- No engagement bait. No hashtags in the lead tweet.
- ≤1 emoji in the lead tweet.
- Use first-person ("I spent...", "Last time I..."). Concrete numbers > vague qualifiers.
</HARD-RULES>

<POLICY>
${voice.policy.x_en}
</POLICY>

<VOICE-PROFILE>
${voice.profile}
</VOICE-PROFILE>

<EXAMPLES>
${examples}
</EXAMPLES>

Decide single vs thread by the article's structure: ≥3 distinct claims that
benefit from sequential framing → thread of 8-12. Otherwise → single.
Emit using the emit_draft tool.`;
};

export const writeXEn = async (ctx: { article: Article }): Promise<Result<Draft>> => {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const system = await buildSystemBlock();
    const truncatedBody = ctx.article.body.slice(0, ARTICLE_BODY_TRUNCATE);

    const response = await client.messages.create({
      model: WRITER_MODEL,
      max_tokens: 1500,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: [TOOL] as never,
      tool_choice: { type: "tool", name: "emit_draft" } as never,
      messages: [{
        role: "user",
        content: `<ARTICLE>
title: ${ctx.article.title}
summary: ${ctx.article.summary}
url: ${ctx.article.sourceUrl}

body:
${truncatedBody}
</ARTICLE>

Generate the X-EN draft.`,
      }],
    });

    const block = response.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return err(generationError("writer", "x_en", "no tool_use block"));
    const parsed = EmitDraftSchema.safeParse(block.input);
    if (!parsed.success) return err(generationError("writer", "x_en", parsed.error));

    const out = parsed.data;
    if (out.type === "single") {
      return ok({ body: out.body, mediaUrl: ctx.article.cover?.src ?? null });
    }
    return ok({
      body: out.parts[0]!,
      threadTail: out.parts.slice(1),
      mediaUrl: ctx.article.cover?.src ?? null,
    });
  } catch (cause) {
    return err(generationError("writer", "x_en", cause));
  }
};
```

- [ ] **Step 4: Run tests**

Run: `pnpm test test/lib/social/writers/x-en.test.ts`
Expected: PASS for single-tweet test. If thread fixture missing, add it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/writers/x-en.ts test/lib/social/writers/x-en.test.ts test/fixtures/anthropic/
git commit -m "feat(social): writeXEn (single + thread) with structured tool output"
```

---

### Task 11: writeLiEn (LinkedIn EN with AI-disclosure rule)

**Files:**
- Create: `src/lib/social/writers/linkedin-en.ts`
- Create: `test/lib/social/writers/linkedin-en.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// test/lib/social/writers/linkedin-en.test.ts
import { describe, it, expect, vi } from "vitest";
import { writeLiEn } from "~/lib/social/writers/linkedin-en";
import { mockAnthropicWithFixture } from "../../../fixtures/anthropic/index.js";
import type { Article } from "~/lib/social/types";

const article: Article = {
  collection: "posts", slug: "multi-agent-postgres",
  title: "T", summary: "S", body: "B",
  tags: [], pubDate: new Date(), cover: null,
  lang: "ru", sourceUrl: "https://artka.dev/blog/multi-agent-postgres",
  hasEnTwin: true,
};

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicWithFixture("writer-li_en-happy") },
  })),
}));

describe("writeLiEn", () => {
  it("returns draft within 1300-1900 chars", async () => {
    const r = await writeLiEn({ article });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.body.length).toBeGreaterThanOrEqual(1300);
      expect(r.value.body.length).toBeLessThanOrEqual(1900);
    }
  });

  it("contains 3-5 PascalCase hashtags", async () => {
    const r = await writeLiEn({ article });
    if (r.ok) {
      const hashtags = r.value.body.match(/#[A-Z][A-Za-z0-9]*/g) ?? [];
      expect(hashtags.length).toBeGreaterThanOrEqual(3);
      expect(hashtags.length).toBeLessThanOrEqual(5);
    }
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test test/lib/social/writers/linkedin-en.test.ts`
Expected: FAIL — not implemented.

- [ ] **Step 3: Implementation**

```ts
// src/lib/social/writers/linkedin-en.ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { WRITER_MODEL, ARTICLE_BODY_TRUNCATE } from "../config.js";
import { generationError, ok, err } from "../errors.js";
import { loadVoiceCard } from "../voice/loader.js";
import type { Article, Draft } from "../types.js";
import type { Result } from "../errors.js";

const EmitDraftSchema = z.object({
  body: z.string().min(1300).max(1900),
});

const TOOL = {
  name: "emit_draft",
  description: "Emit the LinkedIn draft body.",
  input_schema: {
    type: "object",
    properties: { body: { type: "string", minLength: 1300, maxLength: 1900 } },
    required: ["body"],
  },
} as const;

const buildSystemBlock = async () => {
  const voice = await loadVoiceCard();
  return `You are writing a LinkedIn post in ENGLISH for Artem Kashuta's audience.

<HARD-RULES>
- Length: 1300 ≤ chars ≤ 1900.
- AI-disclosure REQUIRED in the first 1-2 lines (e.g. "Drafted with Claude, edited by hand.").
- 3 to 5 PascalCase hashtags at the end (e.g. #FunctionalTypeScript).
- No ALL-CAPS headers.
- No external links in the first 100 chars.
- Use line breaks; avoid wall-of-text paragraphs.
</HARD-RULES>

<POLICY>
${voice.policy.li_en}
</POLICY>

<VOICE-PROFILE>
${voice.profile}
</VOICE-PROFILE>

<EXAMPLES>
${JSON.stringify(voice.examples.li_en, null, 2)}
</EXAMPLES>

Emit using the emit_draft tool.`;
};

export const writeLiEn = async (ctx: { article: Article }): Promise<Result<Draft>> => {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const system = await buildSystemBlock();
    const truncated = ctx.article.body.slice(0, ARTICLE_BODY_TRUNCATE);

    const response = await client.messages.create({
      model: WRITER_MODEL,
      max_tokens: 2500,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: [TOOL] as never,
      tool_choice: { type: "tool", name: "emit_draft" } as never,
      messages: [{
        role: "user",
        content: `<ARTICLE>
title: ${ctx.article.title}
summary: ${ctx.article.summary}
url: ${ctx.article.sourceUrl}

body:
${truncated}
</ARTICLE>

Generate the LinkedIn-EN draft.`,
      }],
    });

    const block = response.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return err(generationError("writer", "li_en", "no tool_use block"));
    const parsed = EmitDraftSchema.safeParse(block.input);
    if (!parsed.success) return err(generationError("writer", "li_en", parsed.error));

    return ok({ body: parsed.data.body, mediaUrl: ctx.article.cover?.src ?? null });
  } catch (cause) {
    return err(generationError("writer", "li_en", cause));
  }
};
```

- [ ] **Step 4: Run tests**

Run: `pnpm test test/lib/social/writers/linkedin-en.test.ts`
Expected: PASS — depending on the recorded fixture body. If body lacks hashtags or AI-disclosure, regenerate the fixture.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/writers/linkedin-en.ts test/lib/social/writers/linkedin-en.test.ts test/fixtures/anthropic/writer-li_en-happy.json
git commit -m "feat(social): writeLiEn with AI-disclosure + hashtag rule"
```

---

### Task 12: writeTgRu (Telegram RU MarkdownV2)

**Files:**
- Create: `src/lib/social/writers/telegram-ru.ts`
- Create: `test/lib/social/writers/telegram-ru.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// test/lib/social/writers/telegram-ru.test.ts
import { describe, it, expect, vi } from "vitest";
import { writeTgRu } from "~/lib/social/writers/telegram-ru";
import { validateMarkdownV2 } from "~/lib/social/markdown-v2";
import { mockAnthropicWithFixture } from "../../../fixtures/anthropic/index.js";
import type { Article } from "~/lib/social/types";

const article: Article = {
  collection: "posts", slug: "multi-agent-postgres",
  title: "T", summary: "S", body: "B",
  tags: [], pubDate: new Date(), cover: null,
  lang: "ru", sourceUrl: "https://artka.dev/blog/multi-agent-postgres",
  hasEnTwin: true,
};

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicWithFixture("writer-tg_ru-happy") },
  })),
}));

describe("writeTgRu", () => {
  it("returns valid MarkdownV2 in 200-600 chars", async () => {
    const r = await writeTgRu({ article });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.body.length).toBeGreaterThanOrEqual(200);
      expect(r.value.body.length).toBeLessThanOrEqual(600);
      const v = validateMarkdownV2(r.value.body);
      expect(v.ok).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run, expect fail**

Run: `pnpm test test/lib/social/writers/telegram-ru.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implementation (mirror writeLiEn structure)**

Pattern is identical to `writeLiEn` with these differences:
- System block uses `voice.policy.tg_ru` and `voice.examples.tg_ru`
- HARD-RULES: 200 ≤ length ≤ 600, MarkdownV2 valid, lead emoji + bold hook, 0 hashtags, link in last line, escape reserved chars
- Tool schema: `{ body: z.string().min(200).max(600) }`
- After parsing: validate body via `validateMarkdownV2(body)`. If invalid → `err(generationError("writer", "tg_ru", `markdownV2: ${issues.join(", ")}`))`. This means LLM must produce already-escaped output.

```ts
// src/lib/social/writers/telegram-ru.ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { WRITER_MODEL, ARTICLE_BODY_TRUNCATE } from "../config.js";
import { generationError, ok, err } from "../errors.js";
import { loadVoiceCard } from "../voice/loader.js";
import { validateMarkdownV2 } from "../markdown-v2.js";
import type { Article, Draft } from "../types.js";
import type { Result } from "../errors.js";

const EmitDraftSchema = z.object({ body: z.string().min(200).max(600) });

const TOOL = {
  name: "emit_draft",
  description: "Emit the Telegram draft body in MarkdownV2 (ALL reserved chars must be escaped with backslash).",
  input_schema: {
    type: "object",
    properties: { body: { type: "string", minLength: 200, maxLength: 600 } },
    required: ["body"],
  },
} as const;

const buildSystemBlock = async () => {
  const voice = await loadVoiceCard();
  return `Ты пишешь пост в Telegram-канал «artka_blog» на русском языке.

<HARD-RULES>
- Длина: 200 ≤ chars ≤ 600.
- MarkdownV2: ВСЕ reserved chars (_*[]()~\`>#+-=|{}.!) экранируй обратным слэшем, КРОМЕ внутри **bold**, *italic*, \`code\`, [label](url).
- Первая строка: emoji + **bold-хук**.
- Последняя строка: ссылка на статью без preview.
- 0 хэштегов.
- Без фейковых CTA («Жми сейчас», «Like если согласен»).
</HARD-RULES>

<POLICY>
${voice.policy.tg_ru}
</POLICY>

<VOICE-PROFILE>
${voice.profile}
</VOICE-PROFILE>

<EXAMPLES>
${JSON.stringify(voice.examples.tg_ru, null, 2)}
</EXAMPLES>

Используй tool emit_draft.`;
};

export const writeTgRu = async (ctx: { article: Article }): Promise<Result<Draft>> => {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const system = await buildSystemBlock();
    const truncated = ctx.article.body.slice(0, ARTICLE_BODY_TRUNCATE);

    const response = await client.messages.create({
      model: WRITER_MODEL,
      max_tokens: 1200,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: [TOOL] as never,
      tool_choice: { type: "tool", name: "emit_draft" } as never,
      messages: [{
        role: "user",
        content: `<ARTICLE>
title: ${ctx.article.title}
summary: ${ctx.article.summary}
url: ${ctx.article.sourceUrl}

body:
${truncated}
</ARTICLE>

Сгенерируй TG-RU draft.`,
      }],
    });

    const block = response.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return err(generationError("writer", "tg_ru", "no tool_use block"));
    const parsed = EmitDraftSchema.safeParse(block.input);
    if (!parsed.success) return err(generationError("writer", "tg_ru", parsed.error));

    const v = validateMarkdownV2(parsed.data.body);
    if (!v.ok) return err(generationError("writer", "tg_ru", `markdownV2: ${v.issues.join(", ")}`));

    return ok({ body: parsed.data.body, mediaUrl: ctx.article.cover?.src ?? null });
  } catch (cause) {
    return err(generationError("writer", "tg_ru", cause));
  }
};
```

- [ ] **Step 4: Run tests**

Run: `pnpm test test/lib/social/writers/telegram-ru.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/writers/telegram-ru.ts test/lib/social/writers/telegram-ru.test.ts test/fixtures/anthropic/writer-tg_ru-happy.json
git commit -m "feat(social): writeTgRu with MarkdownV2 validation"
```

---

## Phase 4 — Editors (Sonnet, voice rewriting)

### Task 13: Editor for X-EN

**Files:**
- Create: `src/lib/social/editors/x-en.ts`
- Create: `test/lib/social/editors/x-en.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// test/lib/social/editors/x-en.test.ts
import { describe, it, expect, vi } from "vitest";
import { editXEn } from "~/lib/social/editors/x-en";
import { mockAnthropicWithFixture } from "../../../fixtures/anthropic/index.js";
import type { Article } from "~/lib/social/types";

const article: Article = {
  collection: "posts", slug: "x", title: "T", summary: "S", body: "B",
  tags: [], pubDate: new Date(), cover: null, lang: "ru",
  sourceUrl: "https://artka.dev/x", hasEnTwin: true,
};

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicWithFixture("editor-x_en-happy") },
  })),
}));

describe("editXEn", () => {
  it("preserves single→single", async () => {
    const draft = { body: "Original draft.", mediaUrl: null };
    const r = await editXEn(article, draft);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.threadTail ?? []).toEqual([]);
  });

  it("preserves thread→thread (length unchanged)", async () => {
    const draft = { body: "T1", threadTail: ["T2", "T3", "T4", "T5", "T6", "T7", "T8"], mediaUrl: null };
    // Editor must keep parts.length === 8 (thread → thread)
    // (mock fixture editor-x_en-thread to return 8-tweet thread)
    // — replace the global mock per test if needed.
  });
});
```

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implementation**

```ts
// src/lib/social/editors/x-en.ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { EDITOR_MODEL, ARTICLE_BODY_TRUNCATE } from "../config.js";
import { generationError, ok, err } from "../errors.js";
import { loadVoiceCard } from "../voice/loader.js";
import type { Article, Draft } from "../types.js";
import type { Result } from "../errors.js";

const EmitEditedSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("single"), body: z.string().min(1).max(270) }),
  z.object({ type: z.literal("thread"), parts: z.array(z.string().min(1).max(280)).min(2).max(15) }),
]);

const TOOL = {
  name: "emit_edited",
  description: "Emit the rewritten X draft. Keep the same type as the input (single→single, thread→thread).",
  input_schema: {
    type: "object",
    oneOf: [
      { properties: { type: { const: "single" }, body: { type: "string", maxLength: 270 } }, required: ["type", "body"] },
      { properties: { type: { const: "thread" }, parts: { type: "array", items: { type: "string", maxLength: 280 } } }, required: ["type", "parts"] },
    ],
  },
} as const;

const buildSystem = async () => {
  const v = await loadVoiceCard();
  return `You are the EDITOR for an X (Twitter) post written in ENGLISH.

Your job: rewrite the draft in Artem's voice. Keep the structure (single vs thread) and the AI-disclosure if any. Cut clichés. Replace abstractions with concrete facts. Match Artem's typical opening rhythms.

<VOICE-PROFILE>
${v.profile}
</VOICE-PROFILE>

<BANNED-PHRASES (en)>
${JSON.stringify(v.banned.en)}
</BANNED-PHRASES>

<POLICY>
${v.policy.x_en}
</POLICY>

<EXAMPLES>
${JSON.stringify(v.examples.x_en, null, 2)}
</EXAMPLES>

Use the emit_edited tool. NEVER convert single↔thread.`;
};

export const editXEn = async (article: Article, draft: Draft): Promise<Result<Draft>> => {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const system = await buildSystem();
    const truncated = article.body.slice(0, ARTICLE_BODY_TRUNCATE);
    const draftPayload = draft.threadTail
      ? { type: "thread" as const, parts: [draft.body, ...draft.threadTail] }
      : { type: "single" as const, body: draft.body };

    const response = await client.messages.create({
      model: EDITOR_MODEL,
      max_tokens: 2000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: [TOOL] as never,
      tool_choice: { type: "tool", name: "emit_edited" } as never,
      messages: [{
        role: "user",
        content: `<ARTICLE>
title: ${article.title}
url: ${article.sourceUrl}
body:
${truncated}
</ARTICLE>

<DRAFT>
${JSON.stringify(draftPayload, null, 2)}
</DRAFT>

Rewrite this draft in Artem's voice using emit_edited.`,
      }],
    });

    const block = response.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") return err(generationError("editor", "x_en", "no tool_use"));
    const parsed = EmitEditedSchema.safeParse(block.input);
    if (!parsed.success) return err(generationError("editor", "x_en", parsed.error));

    const out = parsed.data;
    if (out.type !== draftPayload.type) {
      return err(generationError("editor", "x_en", `type changed ${draftPayload.type}→${out.type}`));
    }
    if (out.type === "single") {
      return ok({ body: out.body, mediaUrl: draft.mediaUrl });
    }
    return ok({ body: out.parts[0]!, threadTail: out.parts.slice(1), mediaUrl: draft.mediaUrl });
  } catch (cause) {
    return err(generationError("editor", "x_en", cause));
  }
};
```

- [ ] **Step 4: Run tests.**

Run: `pnpm test test/lib/social/editors/x-en.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/editors/x-en.ts test/lib/social/editors/x-en.test.ts test/fixtures/anthropic/editor-x_en-*.json
git commit -m "feat(social): editXEn (voice rewrite, preserves single/thread type)"
```

---

### Task 14: Editor for LinkedIn-EN

**Files:**
- Create: `src/lib/social/editors/linkedin-en.ts`
- Create: `test/lib/social/editors/linkedin-en.test.ts`

Pattern identical to `editXEn` minus thread support. Schema: `{ body: z.string().min(1300).max(1900) }`. System prompt instructs to preserve AI-disclosure in first 1-2 lines. Test asserts hashtag count remains 3-5 after edit.

- [ ] **Step 1**: Write test (mirror Task 13's structure with LI fixture).
- [ ] **Step 2**: Run, expect fail.
- [ ] **Step 3**: Implementation (mirror Task 13, drop thread branches).
- [ ] **Step 4**: Run tests.
- [ ] **Step 5**: `git commit -m "feat(social): editLiEn (voice rewrite, preserves AI-disclosure)"`

---

### Task 15: Editor for Telegram-RU

**Files:**
- Create: `src/lib/social/editors/telegram-ru.ts`
- Create: `test/lib/social/editors/telegram-ru.test.ts`

Same as Task 14 plus `validateMarkdownV2` post-parse check (mirroring `writeTgRu`). Russian banned phrases from `voice.banned.ru`.

- [ ] **Step 1-5** same shape as Task 14, with TG specifics.
- [ ] Commit: `feat(social): editTgRu with MarkdownV2 re-validation`

---

## Phase 5 — Critic

### Task 16: runCritic (Sonnet, batch annotation)

**Files:**
- Create: `src/lib/social/critic.ts`
- Create: `test/lib/social/critic.test.ts`

- [ ] **Step 1: Write test**

```ts
// test/lib/social/critic.test.ts
import { describe, it, expect, vi } from "vitest";
import { runCritic } from "~/lib/social/critic";
import { mockAnthropicWithFixture } from "../../fixtures/anthropic/index.js";
import type { Article, Draft } from "~/lib/social/types";

const article: Article = {
  collection: "posts", slug: "x", title: "T", summary: "S", body: "B",
  tags: [], pubDate: new Date(), cover: null, lang: "ru",
  sourceUrl: "https://artka.dev/x", hasEnTwin: true,
};

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicWithFixture("critic-happy") },
  })),
}));

describe("runCritic", () => {
  it("returns annotations per channel for each draft", async () => {
    const drafts: { channel: "x_en" | "li_en" | "tg_ru"; draft: Draft }[] = [
      { channel: "x_en", draft: { body: "X body", mediaUrl: null } },
      { channel: "li_en", draft: { body: "LI body".repeat(200), mediaUrl: null } },
      { channel: "tg_ru", draft: { body: "TG body", mediaUrl: null } },
    ];
    const r = await runCritic(article, drafts);
    expect(r).toHaveProperty("x_en");
    expect(r).toHaveProperty("li_en");
    expect(r).toHaveProperty("tg_ru");
    expect(Array.isArray(r.x_en)).toBe(true);
  });
});
```

- [ ] **Step 2: Create fixture `test/fixtures/anthropic/critic-happy.json`**

```json
{
  "id": "msg_critic",
  "type": "message",
  "role": "assistant",
  "model": "claude-sonnet-4-6",
  "content": [{
    "type": "tool_use",
    "id": "toolu_critic",
    "name": "emit_critique",
    "input": {
      "x_en": [
        { "severity": "warn", "kind": "tone", "message": "'lightweight' tilts marketing-speak" }
      ],
      "li_en": [],
      "tg_ru": [
        { "severity": "warn", "kind": "length", "message": "478 chars — fine" }
      ]
    }
  }],
  "stop_reason": "tool_use",
  "usage": { "input_tokens": 6000, "output_tokens": 200 }
}
```

- [ ] **Step 3: Implementation**

```ts
// src/lib/social/critic.ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { CRITIC_MODEL, ARTICLE_BODY_TRUNCATE } from "./config.js";
import { generationError, ok, err } from "./errors.js";
import { loadVoiceCard } from "./voice/loader.js";
import type { Article, CriticNote, Draft, SocialChannel } from "./types.js";
import type { Result } from "./errors.js";

const NoteSchema = z.discriminatedUnion("severity", [
  z.object({ severity: z.literal("block"), kind: z.enum(["fact", "policy"]), message: z.string(), span: z.tuple([z.number(), z.number()]).optional(), tag: z.string().optional() }),
  z.object({ severity: z.literal("warn"), kind: z.enum(["tone", "length"]), message: z.string(), span: z.tuple([z.number(), z.number()]).optional() }),
]);

const CritiqueSchema = z.object({
  x_en: z.array(NoteSchema),
  li_en: z.array(NoteSchema),
  tg_ru: z.array(NoteSchema),
});

const TOOL = {
  name: "emit_critique",
  description: "Emit per-channel annotation arrays.",
  input_schema: {
    type: "object",
    properties: {
      x_en: { type: "array", items: { type: "object" } },
      li_en: { type: "array", items: { type: "object" } },
      tg_ru: { type: "array", items: { type: "object" } },
    },
    required: ["x_en", "li_en", "tg_ru"],
  },
} as const;

const buildSystem = async () => {
  const v = await loadVoiceCard();
  return `You are an EDITORIAL CRITIC. Read-only. You annotate; you DO NOT rewrite.

For each of the three channels (x_en, li_en, tg_ru), emit zero or more notes:

- severity "block": fact errors (claims not in source article), policy violations (per-channel rules below).
- severity "warn": tone (banned phrases / patterns), length (outside ranges).

<POLICY: X-EN>
${v.policy.x_en}
</POLICY>

<POLICY: LI-EN>
${v.policy.li_en}
</POLICY>

<POLICY: TG-RU>
${v.policy.tg_ru}
</POLICY>

<BANNED-PHRASES>
${JSON.stringify(v.banned)}
</BANNED-PHRASES>

For LI-EN specifically: if AI-disclosure is missing in the first 1-2 lines, emit
{ severity:'block', kind:'policy', tag:'ai-disclosure', message:'Missing AI-disclosure'}.

Use emit_critique tool.`;
};

export const runCritic = async (
  article: Article,
  drafts: { channel: SocialChannel; draft: Draft }[],
): Promise<Record<SocialChannel, CriticNote[]>> => {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const system = await buildSystem();
    const truncated = article.body.slice(0, ARTICLE_BODY_TRUNCATE);

    const draftMap: Record<SocialChannel, unknown> = { x_en: null, li_en: null, tg_ru: null };
    for (const { channel, draft } of drafts) {
      draftMap[channel] = draft.threadTail
        ? { type: "thread", parts: [draft.body, ...draft.threadTail] }
        : { body: draft.body };
    }

    const response = await client.messages.create({
      model: CRITIC_MODEL,
      max_tokens: 2000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: [TOOL] as never,
      tool_choice: { type: "tool", name: "emit_critique" } as never,
      messages: [{
        role: "user",
        content: `<ARTICLE>
title: ${article.title}
summary: ${article.summary}
url: ${article.sourceUrl}
body:
${truncated}
</ARTICLE>

<DRAFTS>
${JSON.stringify(draftMap, null, 2)}
</DRAFTS>

Annotate using emit_critique.`,
      }],
    });

    const block = response.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") {
      return { x_en: [], li_en: [], tg_ru: [] };  // graceful degradation
    }
    const parsed = CritiqueSchema.safeParse(block.input);
    if (!parsed.success) return { x_en: [], li_en: [], tg_ru: [] };
    return parsed.data as Record<SocialChannel, CriticNote[]>;
  } catch {
    return { x_en: [], li_en: [], tg_ru: [] };
  }
};

export const hasBlockAnnotations = (notes: CriticNote[] | null | undefined): boolean =>
  Array.isArray(notes) && notes.some((n) => n.severity === "block");
```

- [ ] **Step 4: Run tests.**

Run: `pnpm test test/lib/social/critic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/critic.ts test/lib/social/critic.test.ts test/fixtures/anthropic/critic-happy.json
git commit -m "feat(social): runCritic (read-only, batch annotations per channel)"
```

---

## Phase 6 — Pipeline + Action: generate

### Task 17: Article loader and sourceHash

**Files:**
- Create: `src/actions/_social.ts`
- Create: `test/actions/_social.test.ts`

- [ ] **Step 1: Test**

```ts
// test/actions/_social.test.ts
import { describe, it, expect } from "vitest";
import { computeSourceHash } from "~/actions/_social";

describe("computeSourceHash", () => {
  it("is deterministic", () => {
    const a = { title: "T", body: "B", frontmatter: { x: 1 } };
    expect(computeSourceHash(a)).toBe(computeSourceHash(a));
  });

  it("changes when body changes", () => {
    const a = computeSourceHash({ title: "T", body: "B1", frontmatter: {} });
    const b = computeSourceHash({ title: "T", body: "B2", frontmatter: {} });
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run, expect fail. Step 3: Implementation**

```ts
// src/actions/_social.ts
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getCollection } from "astro:content";
import type { Article, SocialChannel } from "~/lib/social/types";

export const computeSourceHash = (input: { title: string; body: string; frontmatter: unknown }): string =>
  createHash("sha256")
    .update(input.title)
    .update("\n---\n")
    .update(input.body)
    .update("\n---\n")
    .update(JSON.stringify(input.frontmatter))
    .digest("hex");

export const loadArticle = async (slug: string, collection: "posts" = "posts"): Promise<Article> => {
  const entries = await getCollection(collection);
  const entry = entries.find((e) => e.id === slug);
  if (!entry) throw new Error(`article not found: ${collection}/${slug}`);
  const fm = entry.data;
  const enPath = join(process.cwd(), `src/content/posts/en/${slug}.md`);
  return {
    collection: "posts",
    slug,
    title: fm.title,
    summary: fm.summary ?? fm.description ?? "",
    body: entry.body ?? "",
    tags: fm.tags ?? [],
    pubDate: fm.pubDate ?? new Date(),
    cover: fm.cover ? { src: fm.cover, alt: fm.coverAlt ?? "" } : null,
    lang: (fm.lang ?? "ru") as "ru" | "en",
    sourceUrl: `https://artka.dev/blog/${slug}`,
    hasEnTwin: existsSync(enPath),
  };
};

export const decideChannels = (article: Article): SocialChannel[] => {
  if (article.hasEnTwin) return ["x_en", "li_en", "tg_ru"];
  return ["tg_ru"];
};
```

- [ ] **Step 4: Run tests. Step 5: Commit.**

```bash
git add src/actions/_social.ts test/actions/_social.test.ts
git commit -m "feat(social): article loader + sourceHash + decideChannels"
```

---

### Task 18: Pipeline orchestrator

**Files:**
- Create: `src/lib/social/pipeline.ts`
- Create: `test/lib/social/pipeline.test.ts` (integration-style with mocked stages)

- [ ] **Step 1: Test (sketch — integration test with mocks)**

```ts
// test/lib/social/pipeline.test.ts
import { describe, it, expect, vi } from "vitest";
import { runPipeline } from "~/lib/social/pipeline";
import { ok } from "~/lib/social/errors";
import type { Article } from "~/lib/social/types";

vi.mock("~/lib/social/writers/x-en", () => ({ writeXEn: vi.fn().mockResolvedValue(ok({ body: "x", mediaUrl: null })) }));
vi.mock("~/lib/social/writers/linkedin-en", () => ({ writeLiEn: vi.fn().mockResolvedValue(ok({ body: "li body".repeat(300), mediaUrl: null })) }));
vi.mock("~/lib/social/writers/telegram-ru", () => ({ writeTgRu: vi.fn().mockResolvedValue(ok({ body: "tg body".repeat(60), mediaUrl: null })) }));
vi.mock("~/lib/social/editors/x-en", () => ({ editXEn: vi.fn(async (_a, d) => ok({ ...d, body: d.body + " (edited)" })) }));
vi.mock("~/lib/social/editors/linkedin-en", () => ({ editLiEn: vi.fn(async (_a, d) => ok(d)) }));
vi.mock("~/lib/social/editors/telegram-ru", () => ({ editTgRu: vi.fn(async (_a, d) => ok(d)) }));
vi.mock("~/lib/social/critic", () => ({ runCritic: vi.fn().mockResolvedValue({ x_en: [], li_en: [], tg_ru: [] }) }));

const article: Article = {
  collection: "posts", slug: "x", title: "T", summary: "S", body: "B",
  tags: [], pubDate: new Date(), cover: null, lang: "ru",
  sourceUrl: "u", hasEnTwin: true,
};

describe("runPipeline", () => {
  it("returns drafts + annotations for all 3 channels", async () => {
    const r = await runPipeline({ article, channels: ["x_en", "li_en", "tg_ru"] });
    expect(Object.keys(r.drafts).sort()).toEqual(["li_en", "tg_ru", "x_en"]);
    expect(r.drafts.x_en?.ok).toBe(true);
    if (r.drafts.x_en?.ok) expect(r.drafts.x_en.value.body).toContain("(edited)");
    expect(r.annotations.x_en).toEqual([]);
  });

  it("excludes failed channels from critic input but reports failures", async () => {
    // re-mock writeXEn to fail in this test
    // ...
  });
});
```

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implementation**

```ts
// src/lib/social/pipeline.ts
import type { Article, CriticNote, Draft, SocialChannel } from "./types.js";
import type { Result } from "./errors.js";
import { writeXEn } from "./writers/x-en.js";
import { writeLiEn } from "./writers/linkedin-en.js";
import { writeTgRu } from "./writers/telegram-ru.js";
import { editXEn } from "./editors/x-en.js";
import { editLiEn } from "./editors/linkedin-en.js";
import { editTgRu } from "./editors/telegram-ru.js";
import { runCritic } from "./critic.js";

type WriterFn = (ctx: { article: Article }) => Promise<Result<Draft>>;
type EditorFn = (article: Article, draft: Draft) => Promise<Result<Draft>>;

const writers: Record<SocialChannel, WriterFn> = {
  x_en: writeXEn,
  li_en: writeLiEn,
  tg_ru: writeTgRu,
};
const editors: Record<SocialChannel, EditorFn> = {
  x_en: editXEn,
  li_en: editLiEn,
  tg_ru: editTgRu,
};

export type PipelineOutput = {
  drafts: Partial<Record<SocialChannel, Result<Draft>>>;
  annotations: Record<SocialChannel, CriticNote[]>;
};

export const runPipeline = async (
  args: { article: Article; channels: SocialChannel[] },
): Promise<PipelineOutput> => {
  // Stage 1: parallel writers
  const writerOut = await Promise.all(
    args.channels.map(async (ch) => [ch, await writers[ch]({ article: args.article })] as const),
  );

  // Stage 2: parallel editors (only for successful writers)
  const editorOut = await Promise.all(
    writerOut.map(async ([ch, r]) => {
      if (!r.ok) return [ch, r] as const;
      return [ch, await editors[ch](args.article, r.value)] as const;
    }),
  );

  // Stage 3: critic (only successful drafts)
  const validDrafts: { channel: SocialChannel; draft: Draft }[] = [];
  for (const [ch, r] of editorOut) if (r.ok) validDrafts.push({ channel: ch, draft: r.value });

  const annotations = validDrafts.length > 0
    ? await runCritic(args.article, validDrafts)
    : { x_en: [], li_en: [], tg_ru: [] };

  const drafts: PipelineOutput["drafts"] = {};
  for (const [ch, r] of editorOut) drafts[ch] = r;

  return { drafts, annotations };
};
```

- [ ] **Step 4: Run tests. Step 5: Commit.**

```bash
git add src/lib/social/pipeline.ts test/lib/social/pipeline.test.ts
git commit -m "feat(social): runPipeline (writer→editor→critic, fault-tolerant)"
```

---

### Task 19: Action `socialDrafts.generate`

**Files:**
- Create: `src/actions/socialDrafts.ts`
- Create: `test/actions/socialDrafts.generate.test.ts`

- [ ] **Step 1: Test (integration with real Postgres in Docker)**

```ts
// test/actions/socialDrafts.generate.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "~/lib/db";
import { socialPosts } from "~/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { socialDrafts } from "~/actions/socialDrafts";

// mock pipeline so this test doesn't dial Anthropic
vi.mock("~/lib/social/pipeline", () => ({
  runPipeline: vi.fn().mockResolvedValue({
    drafts: {
      x_en: { ok: true, value: { body: "x out", mediaUrl: null } },
      li_en: { ok: true, value: { body: "li out".repeat(300), mediaUrl: null } },
      tg_ru: { ok: true, value: { body: "tg out".repeat(60), mediaUrl: null } },
    },
    annotations: { x_en: [], li_en: [], tg_ru: [] },
  }),
}));

vi.mock("~/actions/_social", async () => {
  const real = await vi.importActual<typeof import("~/actions/_social")>("~/actions/_social");
  return {
    ...real,
    loadArticle: vi.fn().mockResolvedValue({
      collection: "posts", slug: "test-post", title: "T", summary: "S", body: "B",
      tags: [], pubDate: new Date(), cover: null, lang: "ru",
      sourceUrl: "https://artka.dev/blog/test-post", hasEnTwin: true,
    }),
  };
});

beforeEach(async () => {
  await db.delete(socialPosts).where(eq(socialPosts.postSlug, "test-post"));
});

describe("socialDrafts.generate", () => {
  it("inserts 3 generating rows transactionally before pipeline runs", async () => {
    const ctx = mockAuthCtx("admin");  // helper from existing test infra
    await socialDrafts.generate.handler({ slug: "test-post", collection: "posts" }, ctx);
    // wait briefly for void runPipeline to populate (or read 'generating' state)
    const rows = await db.select().from(socialPosts).where(eq(socialPosts.postSlug, "test-post"));
    expect(rows.length).toBe(3);
  });

  it("supersedes old rows with different sourceHash", async () => {
    // Pre-insert one stale row
    await db.insert(socialPosts).values({
      postCollection: "posts", postSlug: "test-post", channel: "x_en",
      sourceHash: "OLD", status: "pending", body: "old",
    });
    const ctx = mockAuthCtx("admin");
    await socialDrafts.generate.handler({ slug: "test-post", collection: "posts" }, ctx);
    const rows = await db.select().from(socialPosts).where(and(
      eq(socialPosts.postSlug, "test-post"),
      eq(socialPosts.channel, "x_en"),
    ));
    const stale = rows.find((r) => r.sourceHash === "OLD");
    expect(stale?.status).toBe("superseded");
  });
});

// helper (skeleton)
function mockAuthCtx(role: "admin" | "editor") {
  return { locals: { user: { id: "00000000-0000-0000-0000-000000000001", role } } } as never;
}
```

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implementation**

```ts
// src/actions/socialDrafts.ts
import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";
import { db } from "~/lib/db";
import { socialPosts } from "~/lib/db/schema";
import { eq, and, ne, notInArray } from "drizzle-orm";
import { computeSourceHash, decideChannels, loadArticle } from "./_social.js";
import { assertAdmin } from "./_auth.js";
import { runPipeline } from "~/lib/social/pipeline.js";
import { hasBlockAnnotations } from "~/lib/social/critic.js";
import { isSocialEnabled, WRITER_MODEL, EDITOR_MODEL, CRITIC_MODEL } from "~/lib/social/config.js";
import { stringifyError } from "~/lib/social/errors.js";
import { logger as log } from "~/lib/logger.js";
import type { SocialChannel } from "~/lib/social/types.js";
import { ALL_CHANNELS, EN_CHANNELS } from "~/lib/social/types.js";

const persistResults = async (slug: string, sourceHash: string, output: Awaited<ReturnType<typeof runPipeline>>) => {
  for (const ch of Object.keys(output.drafts) as SocialChannel[]) {
    const r = output.drafts[ch]!;
    if (r.ok) {
      await db.update(socialPosts).set({
        body: r.value.body,
        threadTail: r.value.threadTail ?? null,
        mediaUrl: r.value.mediaUrl,
        criticAnnotations: output.annotations[ch] ?? [],
        generationModel: WRITER_MODEL,
        editorModel: EDITOR_MODEL,
        criticModel: CRITIC_MODEL,
        status: "pending",
        updatedAt: new Date(),
      }).where(and(
        eq(socialPosts.postSlug, slug),
        eq(socialPosts.channel, ch),
        eq(socialPosts.sourceHash, sourceHash),
        eq(socialPosts.status, "generating"),
      ));
    } else {
      await db.update(socialPosts).set({
        status: "failed",
        errorMessage: stringifyError(r.error),
        updatedAt: new Date(),
      }).where(and(
        eq(socialPosts.postSlug, slug),
        eq(socialPosts.channel, ch),
        eq(socialPosts.sourceHash, sourceHash),
        eq(socialPosts.status, "generating"),
      ));
    }
  }
};

export const socialDrafts = {
  generate: defineAction({
    accept: "json",
    input: z.object({
      slug: z.string().min(1),
      collection: z.literal("posts").default("posts"),
      channels: z.array(z.enum(["x_en", "li_en", "tg_ru"])).optional(),
    }),
    handler: async ({ slug, collection, channels }, ctx) => {
      assertAdmin(ctx);
      if (!isSocialEnabled()) {
        return { ok: false, reason: "feature flag off" };
      }

      const article = await loadArticle(slug, collection);
      const sourceHash = computeSourceHash({
        title: article.title,
        body: article.body,
        frontmatter: { tags: article.tags, lang: article.lang, pubDate: article.pubDate },
      });
      const channelsToUse = channels ?? decideChannels(article);

      await db.transaction(async (tx) => {
        // supersede stale rows (different hash, not yet sent)
        await tx.update(socialPosts).set({ status: "superseded", updatedAt: new Date() }).where(and(
          eq(socialPosts.postCollection, collection),
          eq(socialPosts.postSlug, slug),
          ne(socialPosts.sourceHash, sourceHash),
          notInArray(socialPosts.status, ["sent", "sending"]),
        ));
        // insert generating rows
        for (const channel of channelsToUse) {
          await tx.insert(socialPosts).values({
            postCollection: collection,
            postSlug: slug,
            channel,
            sourceHash,
            status: "generating",
            createdById: ctx.locals.user!.id,
          }).onConflictDoNothing();
        }
      });

      // Fire-and-forget LLM pipeline
      void runPipeline({ article, channels: channelsToUse })
        .then((out) => persistResults(slug, sourceHash, out))
        .catch((err) => log.error({ mod: "social", slug, err }, "pipeline crashed"));

      return { ok: true, channels: channelsToUse };
    },
  }),
};
```

- [ ] **Step 4: Run tests.**

Run: `pnpm test test/actions/socialDrafts.generate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/actions/socialDrafts.ts test/actions/socialDrafts.generate.test.ts
git commit -m "feat(social): action socialDrafts.generate (transactional, void pipeline)"
```

---

### Task 20: Hook into `publish.one`

**Files:**
- Modify: `src/actions/publish.ts` — at the end of the success path, call `generateSocialDrafts`.

- [ ] **Step 1: Edit**

In `src/actions/publish.ts`, find the success return path of `publish.one` (search for `commitSha`). Just before the `return` statement of a successful commit, add:

```ts
import { socialDrafts } from "./socialDrafts.js";
import { isSocialEnabled } from "~/lib/social/config.js";

// ... inside publish.one handler, after commit success ...

if (isSocialEnabled() && collection === "posts") {
  // best-effort: do not fail the publish if social generation kickoff fails
  try {
    await socialDrafts.generate.handler({ slug, collection: "posts" }, context);
  } catch (err) {
    // Logged but not surfaced — admin will see this in /admin/social
    console.warn("[social] generate kickoff failed", err);
  }
}
```

> The hook is gated by `collection === "posts"` because socials only apply to blog posts (not site/projects/courses/lessons).

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 3: Manual smoke (locally)**

With `SOCIAL_DRAFTS_ENABLED=true` in `.env`, publish a draft post via admin. Check `/admin/social` (when built in Phase 8) shows 3 generating rows. For now, verify via `pnpm db:studio`.

- [ ] **Step 4: Commit**

```bash
git add src/actions/publish.ts
git commit -m "feat(social): hook socialDrafts.generate into publish.one (gated by feature flag)"
```

---

## Phase 7 — Transport clients

### Task 21: X (Twitter) client

**Files:**
- Create: `src/lib/social/clients/x.ts`
- Create: `test/lib/social/clients/x.test.ts`

- [ ] **Step 1: Test using msw**

```ts
// test/lib/social/clients/x.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { postTweet, postThread } from "~/lib/social/clients/x";

const server = setupServer(
  http.post("https://api.twitter.com/2/tweets", async ({ request }) => {
    const body = await request.json() as { text: string; reply?: { in_reply_to_tweet_id: string } };
    return HttpResponse.json({ data: { id: `id_${Math.random().toString(36).slice(2, 8)}`, text: body.text } });
  }),
);

beforeAll(() => server.listen());
afterAll(() => server.close());

describe("xClient.postTweet", () => {
  it("returns tweet id", async () => {
    const r = await postTweet({ text: "hello" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.id).toMatch(/^id_/);
      expect(r.value.url).toContain(process.env.X_HANDLE ?? "x");
    }
  });
});

describe("xClient.postThread", () => {
  it("posts sequentially and chains in_reply_to_tweet_id", async () => {
    const r = await postThread(["t1", "t2", "t3"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.id).toMatch(/^id_/);
  });
});
```

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implementation**

```ts
// src/lib/social/clients/x.ts
import { ok, err, transportError, policyError } from "../errors.js";
import type { Result } from "../errors.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const apiBase = () => "https://api.twitter.com";

const headers = () => ({
  Authorization: `Bearer ${process.env.X_OAUTH_TOKEN}`,
  "Content-Type": "application/json",
});

const handleResponse = async (response: Response): Promise<Result<{ id: string }>> => {
  if (response.ok) {
    const j = await response.json() as { data: { id: string } };
    return ok({ id: j.data.id });
  }
  const body = await response.text();
  if (response.status === 401 || response.status === 403) {
    return err(policyError("x_en", `${response.status} ${body.slice(0, 200)}`));
  }
  return err(transportError("x_en", response.status, body));
};

export const postTweet = async (
  opts: { text: string; reply?: { in_reply_to_tweet_id: string } },
): Promise<Result<{ id: string; url: string }>> => {
  const response = await fetch(`${apiBase()}/2/tweets`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(opts),
  });
  const r = await handleResponse(response);
  if (!r.ok) return r;
  return ok({ id: r.value.id, url: `https://x.com/${process.env.X_HANDLE}/status/${r.value.id}` });
};

export const postThread = async (parts: string[]): Promise<Result<{ id: string; url: string }>> => {
  if (parts.length === 0) return err(transportError("x_en", 0, "empty thread"));
  let firstId: string | null = null;
  let lastId: string | null = null;
  for (let i = 0; i < parts.length; i += 1) {
    const t = parts[i]!;
    const opts = lastId ? { text: t, reply: { in_reply_to_tweet_id: lastId } } : { text: t };
    const r = await postTweet(opts);
    if (!r.ok) {
      // Mid-thread failure — return error with diagnostic
      return err(transportError("x_en",
        r.error.kind === "transport" ? r.error.status : 0,
        `thread broke at part ${i + 1}/${parts.length} (firstId=${firstId})`,
      ));
    }
    if (i === 0) firstId = r.value.id;
    lastId = r.value.id;
    if (i < parts.length - 1) await sleep(1500);
  }
  return ok({
    id: firstId!,
    url: `https://x.com/${process.env.X_HANDLE}/status/${firstId}`,
  });
};
```

> **Note on OAuth refresh:** for v1 we do not auto-refresh; a 401 returns `policyError`, the operator runs `pnpm social:auth:x` (Task 24) to re-issue tokens. Auto-refresh is a small follow-up.

- [ ] **Step 4: Run tests.**

Run: `pnpm test test/lib/social/clients/x.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/social/clients/x.ts test/lib/social/clients/x.test.ts
git commit -m "feat(social): X client (postTweet, postThread with reply chain)"
```

---

### Task 22: LinkedIn client

**Files:**
- Create: `src/lib/social/clients/linkedin.ts`
- Create: `test/lib/social/clients/linkedin.test.ts`

Implementation pattern same as X client. Endpoint: `POST https://api.linkedin.com/rest/posts` with header `LinkedIn-Version: 202601`. Body shape:

```ts
{
  author: process.env.LINKEDIN_PERSON_URN,
  commentary: text,
  visibility: "PUBLIC",
  distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
  lifecycleState: "PUBLISHED",
  isReshareDisabledByAuthor: false,
}
```

Response includes header `x-restli-id` with the post URN. URL:
`https://www.linkedin.com/feed/update/${urn}/`

- [ ] **Step 1-5**: same shape as Task 21. Test via msw at `https://api.linkedin.com/rest/posts`. Commit: `feat(social): LinkedIn client (postShare via Posts API 2026-01)`.

---

### Task 23: Telegram client

**Files:**
- Create: `src/lib/social/clients/telegram.ts`
- Create: `test/lib/social/clients/telegram.test.ts`

Endpoint: `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage` (or `sendPhoto` if mediaUrl). Body:

```ts
{
  chat_id: process.env.TELEGRAM_CHANNEL_ID,
  text: body,                          // for sendMessage
  parse_mode: "MarkdownV2",
  link_preview_options: { is_disabled: true },
}
```

Response: `{ ok: true, result: { message_id: 123 } }`. URL: `https://t.me/${channelHandle}/${message_id}` where `channelHandle` = `TELEGRAM_CHANNEL_ID.replace('@','')`.

- [ ] **Step 1-5**: same shape. Commit: `feat(social): Telegram client (sendMessage with MarkdownV2)`.

---

### Task 24: OAuth CLI scripts

**Files:**
- Create: `scripts/social-auth-x.ts`
- Create: `scripts/social-auth-linkedin.ts`
- Modify: `package.json` — add scripts

- [ ] **Step 1: X OAuth CLI**

```ts
// scripts/social-auth-x.ts
/**
 * Usage: pnpm social:auth:x
 *
 * 1. Prints an authorization URL.
 * 2. User opens URL in browser, approves, copies the `code` param from the redirect.
 * 3. User pastes the code; script exchanges for access+refresh tokens.
 * 4. Prints two lines to copy into .env:  X_OAUTH_TOKEN=...  X_OAUTH_REFRESH=...
 *
 * NOTE: Does NOT write to .env automatically — operator copies manually.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { randomBytes, createHash } from "node:crypto";

const CALLBACK = "http://localhost:8421/callback";  // local stub; user copies code from URL bar

const main = async () => {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("Set X_CLIENT_ID and X_CLIENT_SECRET in .env first.");
    process.exit(1);
  }

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: CALLBACK,
    scope: "tweet.read tweet.write users.read offline.access",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  console.log("\nOpen this URL in your browser:\n");
  console.log(`  https://twitter.com/i/oauth2/authorize?${params}\n`);
  console.log("After approving, copy the `code` param from the redirect URL.\n");

  const rl = createInterface({ input: stdin, output: stdout });
  const code = (await rl.question("Paste code: ")).trim();
  rl.close();

  const tokenResp = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: CALLBACK,
      code_verifier: verifier,
      client_id: clientId,
    }),
  });
  if (!tokenResp.ok) {
    console.error("Token exchange failed:", await tokenResp.text());
    process.exit(1);
  }
  const tokens = await tokenResp.json() as { access_token: string; refresh_token: string };
  console.log("\nAdd to .env:\n");
  console.log(`X_OAUTH_TOKEN=${tokens.access_token}`);
  console.log(`X_OAUTH_REFRESH=${tokens.refresh_token}\n`);
};

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: LinkedIn OAuth CLI**

Mirror structure: scope `w_member_social openid email`, callback URL same pattern, exchange at `https://www.linkedin.com/oauth/v2/accessToken`.

- [ ] **Step 3: Add to package.json**

```json
{
  "scripts": {
    "social:auth:x": "tsx scripts/social-auth-x.ts",
    "social:auth:linkedin": "tsx scripts/social-auth-linkedin.ts"
  }
}
```

- [ ] **Step 4: Manual smoke test**

`pnpm social:auth:x` prints URL. Stop before exchanging (this requires real X dev app). Just confirm URL builds.

- [ ] **Step 5: Commit**

```bash
git add scripts/social-auth-*.ts package.json
git commit -m "feat(social): OAuth CLI scripts for X and LinkedIn"
```

---

## Phase 8 — Publish + edit + skip + recheck actions

### Task 25: Publish action

**Files:**
- Modify: `src/actions/socialDrafts.ts` (add to the exported object)
- Create: `test/actions/socialDrafts.publish.test.ts`

- [ ] **Step 1: Test (integration with msw + Postgres)**

```ts
// test/actions/socialDrafts.publish.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "~/lib/db";
import { socialPosts } from "~/lib/db/schema";
import { eq } from "drizzle-orm";
import { socialDrafts } from "~/actions/socialDrafts";
import { ok, err, transportError } from "~/lib/social/errors";

vi.mock("~/lib/social/clients/x", () => ({
  postTweet: vi.fn().mockResolvedValue(ok({ id: "abc", url: "https://x.com/u/status/abc" })),
  postThread: vi.fn(),
}));

beforeEach(async () => {
  await db.delete(socialPosts).where(eq(socialPosts.postSlug, "test-pub"));
});

describe("socialDrafts.publish", () => {
  it("transitions pending → sent on success", async () => {
    const [row] = await db.insert(socialPosts).values({
      postCollection: "posts", postSlug: "test-pub", channel: "x_en",
      sourceHash: "h", status: "pending", body: "hello",
    }).returning();

    const ctx = mockAuthCtx("admin");
    const r = await socialDrafts.publish.handler({ id: row!.id, force: false }, ctx);
    expect(r.ok).toBe(true);

    const [after] = await db.select().from(socialPosts).where(eq(socialPosts.id, row!.id));
    expect(after?.status).toBe("sent");
    expect(after?.externalUrl).toContain("x.com");
  });

  it("rejects publish if status not pending", async () => {
    const [row] = await db.insert(socialPosts).values({
      postCollection: "posts", postSlug: "test-pub", channel: "x_en",
      sourceHash: "h", status: "sent", body: "hello",
    }).returning();
    const ctx = mockAuthCtx("admin");
    await expect(socialDrafts.publish.handler({ id: row!.id, force: false }, ctx))
      .rejects.toThrow(/CONFLICT/);
  });

  it("rejects when block annotations present and force=false", async () => {
    const [row] = await db.insert(socialPosts).values({
      postCollection: "posts", postSlug: "test-pub", channel: "x_en",
      sourceHash: "h", status: "pending", body: "hello",
      criticAnnotations: [{ severity: "block", kind: "fact", message: "wrong number" }],
    }).returning();
    const ctx = mockAuthCtx("admin");
    await expect(socialDrafts.publish.handler({ id: row!.id, force: false }, ctx))
      .rejects.toThrow(/BAD_REQUEST/);
  });
});
```

- [ ] **Step 2: Run, expect fail.**

- [ ] **Step 3: Implementation (append to socialDrafts.ts)**

```ts
// inside socialDrafts.ts, additional exports:

import { postTweet, postThread } from "~/lib/social/clients/x.js";
import { postShare } from "~/lib/social/clients/linkedin.js";
import { sendMessage as tgSend } from "~/lib/social/clients/telegram.js";
import { withRetry } from "~/lib/social/retry.js";

const sendByChannel = async (row: typeof socialPosts.$inferSelect) => {
  const fn = async () => {
    if (row.channel === "x_en") {
      if (row.threadTail && row.threadTail.length > 0) {
        return postThread([row.body, ...row.threadTail]);
      }
      return postTweet({ text: row.body });
    }
    if (row.channel === "li_en") return postShare({ text: row.body });
    return tgSend({ text: row.body });
  };
  return withRetry(fn, { maxAttempts: 3, baseDelayMs: 2000 });
};

socialDrafts.publish = defineAction({
  accept: "json",
  input: z.object({ id: z.string().uuid(), force: z.boolean().default(false) }),
  handler: async ({ id, force }, ctx) => {
    assertAdmin(ctx);

    // Atomically pending → sending
    const [row] = await db.update(socialPosts)
      .set({ status: "sending", approvedById: ctx.locals.user!.id, updatedAt: new Date() })
      .where(and(
        eq(socialPosts.id, id),
        eq(socialPosts.status, "pending"),
      ))
      .returning();
    if (!row) throw new ActionError({ code: "CONFLICT", message: "Draft is not pending" });

    if (!force && Array.isArray(row.criticAnnotations) && row.criticAnnotations.some((n: any) => n.severity === "block")) {
      // revert
      await db.update(socialPosts).set({ status: "pending" }).where(eq(socialPosts.id, id));
      throw new ActionError({ code: "BAD_REQUEST", message: "block-level critic notes; resubmit with force=true" });
    }

    const result = await sendByChannel(row);
    if (result.ok) {
      await db.update(socialPosts).set({
        status: "sent",
        externalId: result.value.id,
        externalUrl: result.value.url,
        sentAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(socialPosts.id, id));
      return { ok: true, url: result.value.url };
    }

    await db.update(socialPosts).set({
      status: "failed",
      errorMessage: stringifyError(result.error),
      retryCount: row.retryCount + 1,
      updatedAt: new Date(),
    }).where(eq(socialPosts.id, id));
    return { ok: false, error: stringifyError(result.error) };
  },
});
```

- [ ] **Step 4: Run tests. Step 5: Commit.**

```bash
git add src/actions/socialDrafts.ts test/actions/socialDrafts.publish.test.ts
git commit -m "feat(social): action publish (atomic pending→sending, block-override)"
```

---

### Task 26: save / skip / recheck / regenerate actions

**Files:**
- Modify: `src/actions/socialDrafts.ts`
- Create: `test/actions/socialDrafts.actions.test.ts`

- [ ] **Step 1: Write tests for each (4 tests)**

(Pattern: pre-insert a row, call the action, assert state transition.)

- [ ] **Step 2: Implementation skeletons**

```ts
// add to socialDrafts.ts

socialDrafts.save = defineAction({
  accept: "json",
  input: z.object({
    id: z.string().uuid(),
    body: z.string(),
    threadTail: z.array(z.string()).optional(),
  }),
  handler: async ({ id, body, threadTail }, ctx) => {
    assertAdmin(ctx);
    await db.update(socialPosts).set({
      body,
      threadTail: threadTail ?? null,
      updatedAt: new Date(),
    }).where(and(
      eq(socialPosts.id, id),
      eq(socialPosts.status, "pending"),  // can only save while pending
    ));
    return { ok: true };
  },
});

socialDrafts.skip = defineAction({
  accept: "json",
  input: z.object({ id: z.string().uuid(), reason: z.string().optional() }),
  handler: async ({ id, reason }, ctx) => {
    assertAdmin(ctx);
    await db.update(socialPosts).set({
      status: "skipped",
      errorMessage: reason ?? null,
      updatedAt: new Date(),
    }).where(and(eq(socialPosts.id, id), eq(socialPosts.status, "pending")));
    return { ok: true };
  },
});

socialDrafts.recheck = defineAction({
  accept: "json",
  input: z.object({ id: z.string().uuid() }),
  handler: async ({ id }, ctx) => {
    assertAdmin(ctx);
    const [row] = await db.select().from(socialPosts).where(eq(socialPosts.id, id));
    if (!row) throw new ActionError({ code: "NOT_FOUND" });
    const article = await loadArticle(row.postSlug);
    const annotations = await runCritic(article, [{
      channel: row.channel,
      draft: { body: row.body, threadTail: row.threadTail ?? undefined, mediaUrl: row.mediaUrl },
    }]);
    await db.update(socialPosts).set({
      criticAnnotations: annotations[row.channel] ?? [],
      criticModel: CRITIC_MODEL,
      updatedAt: new Date(),
    }).where(eq(socialPosts.id, id));
    return { ok: true, annotations: annotations[row.channel] };
  },
});

socialDrafts.regenerate = defineAction({
  accept: "json",
  input: z.object({ slug: z.string(), collection: z.literal("posts").default("posts") }),
  handler: async (input, ctx) => {
    assertAdmin(ctx);
    // mark all active rows for this slug as superseded, then re-invoke generate
    await db.update(socialPosts).set({ status: "superseded", updatedAt: new Date() }).where(and(
      eq(socialPosts.postSlug, input.slug),
      notInArray(socialPosts.status, ["sent", "sending", "skipped", "superseded", "failed"]),
    ));
    return socialDrafts.generate.handler(input, ctx);
  },
});
```

- [ ] **Step 3: Run tests. Step 4: Commit.**

```bash
git add src/actions/socialDrafts.ts test/actions/socialDrafts.actions.test.ts
git commit -m "feat(social): actions save/skip/recheck/regenerate"
```

---

## Phase 9 — Admin UI

### Task 27: List page `/admin/social/index.astro`

**Files:**
- Create: `src/pages/admin/social/index.astro`
- Create: `src/components/admin/SocialBatchRow.astro`

- [ ] **Step 1: Build the SQL query for grouped batches**

Use `db.select` with `groupBy(postSlug)` and aggregate counts:

```ts
// in the .astro frontmatter
import { db } from "~/lib/db";
import { socialPosts } from "~/lib/db/schema";
import { sql } from "drizzle-orm";

const batches = await db.select({
  slug: socialPosts.postSlug,
  totalCount: sql<number>`count(*)`,
  pendingCount: sql<number>`count(*) filter (where status = 'pending')`,
  sentCount: sql<number>`count(*) filter (where status = 'sent')`,
  failedCount: sql<number>`count(*) filter (where status = 'failed')`,
  lastUpdated: sql<Date>`max(updated_at)`,
}).from(socialPosts).groupBy(socialPosts.postSlug).orderBy(sql`max(updated_at) desc`);
```

- [ ] **Step 2: Render with Tailwind 4**

```astro
---
// src/pages/admin/social/index.astro
import AdminLayout from "~/layouts/AdminLayout.astro";
import SocialBatchRow from "~/components/admin/SocialBatchRow.astro";
// (see prev step for batches query)
---

<AdminLayout title="Social drafts">
  <div class="mx-auto max-w-3xl p-6">
    <h1 class="text-2xl font-bold mb-6">Social drafts</h1>
    {batches.length === 0 ? (
      <p class="text-fg-2">Пока нет черновиков. Опубликуй пост — они появятся сами.</p>
    ) : (
      <ul class="space-y-3">
        {batches.map((b) => <SocialBatchRow batch={b} />)}
      </ul>
    )}
  </div>
</AdminLayout>
```

`SocialBatchRow.astro`: render slug, status counts, link to `/admin/social/[slug]`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/social/index.astro src/components/admin/SocialBatchRow.astro
git commit -m "feat(social): /admin/social list of batches"
```

---

### Task 28: Detail page `/admin/social/[postSlug].astro`

**Files:**
- Create: `src/pages/admin/social/[postSlug].astro`

- [ ] **Step 1: Fetch all 3 (or fewer) rows for the slug**

```astro
---
import { db } from "~/lib/db";
import { socialPosts } from "~/lib/db/schema";
import { eq, and } from "drizzle-orm";
import AdminLayout from "~/layouts/AdminLayout.astro";
import DraftCard from "~/components/admin/DraftCard.tsx";

const { postSlug } = Astro.params;
const rows = await db.select()
  .from(socialPosts)
  .where(and(
    eq(socialPosts.postSlug, postSlug!),
    eq(socialPosts.postCollection, "posts"),
  ))
  .orderBy(socialPosts.channel);

if (rows.length === 0) return Astro.redirect("/admin/social");
---

<AdminLayout title={`Social drafts: ${postSlug}`}>
  <div class="mx-auto max-w-4xl p-6 space-y-6">
    <header>
      <a href="/admin/social" class="text-fg-2 text-sm">← Back</a>
      <h1 class="text-2xl font-bold">{postSlug}</h1>
    </header>
    {rows.map((row) => (
      <DraftCard client:idle row={row} />
    ))}
  </div>
</AdminLayout>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/admin/social/[postSlug].astro
git commit -m "feat(social): /admin/social/[postSlug] detail page"
```

---

### Task 29: DraftCard React island

**Files:**
- Create: `src/components/admin/DraftCard.tsx`

- [ ] **Step 1: Implement (functional component, no classes)**

```tsx
// src/components/admin/DraftCard.tsx
import { useState, useEffect, useRef } from "react";
import { actions } from "astro:actions";
import type { SocialPost } from "~/lib/db/schema";
import type { CriticNote } from "~/lib/social/types";

const LIMITS = {
  x_en: 270, li_en: 1900, tg_ru: 600,
} as const;

export default function DraftCard({ row }: { row: SocialPost }) {
  const [body, setBody] = useState(row.body);
  const [threadTail, setThreadTail] = useState<string[] | null>(row.threadTail);
  const [status, setStatus] = useState(row.status);
  const [externalUrl, setExternalUrl] = useState(row.externalUrl);
  const [errorMessage, setErrorMessage] = useState(row.errorMessage);
  const annotations = row.criticAnnotations as CriticNote[] | null;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced auto-save
  useEffect(() => {
    if (status !== "pending") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      actions.socialDrafts.save({ id: row.id, body, threadTail: threadTail ?? undefined });
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [body, threadTail, status, row.id]);

  const limit = LIMITS[row.channel];
  const blocked = (annotations ?? []).some((n) => n.severity === "block");

  const onPublish = async () => {
    if (blocked && !confirm("There are block-level critic notes. Publish anyway?")) return;
    setStatus("sending");
    const r = await actions.socialDrafts.publish({ id: row.id, force: blocked });
    if (r.data?.ok) { setStatus("sent"); setExternalUrl(r.data.url ?? null); }
    else { setStatus("failed"); setErrorMessage(r.data?.error ?? "publish failed"); }
  };

  const onSkip = async () => {
    const reason = prompt("Reason (optional):") ?? undefined;
    await actions.socialDrafts.skip({ id: row.id, reason });
    setStatus("skipped");
  };

  const onRecheck = async () => {
    await actions.socialDrafts.recheck({ id: row.id });
    location.reload();  // simplest; fetches fresh annotations
  };

  return (
    <article class="border border-fg-3/20 rounded-lg p-4 space-y-3">
      <header class="flex justify-between items-center">
        <span class="text-sm font-mono">{row.channel} · {status}</span>
        <span class={`text-sm ${body.length > limit ? "text-red-600" : "text-fg-2"}`}>
          {body.length}/{limit}
        </span>
      </header>

      {row.channel === "x_en" && threadTail && threadTail.length > 0 ? (
        <ThreadEditor body={body} threadTail={threadTail} onChange={(b, t) => { setBody(b); setThreadTail(t); }} disabled={status !== "pending"} />
      ) : (
        <textarea
          class="w-full min-h-32 p-2 bg-bg-1 rounded font-sans"
          value={body}
          onChange={(e) => setBody(e.currentTarget.value)}
          disabled={status !== "pending"}
        />
      )}

      {annotations && annotations.length > 0 && (
        <ul class="text-sm space-y-1">
          {annotations.map((n, i) => (
            <li key={i} class={n.severity === "block" ? "text-red-700" : "text-amber-700"}>
              {n.severity === "block" ? "⛔" : "⚠"} {n.kind}: {n.message}
            </li>
          ))}
        </ul>
      )}

      {externalUrl && (
        <p class="text-sm">Sent: <a href={externalUrl} target="_blank" rel="noreferrer" class="underline">{externalUrl}</a></p>
      )}
      {errorMessage && <p class="text-sm text-red-700">Error: {errorMessage}</p>}

      {status === "pending" && (
        <div class="flex gap-2">
          <button onClick={onPublish} class="px-3 py-1.5 bg-fg-1 text-bg-1 rounded">
            Publish {blocked ? "⚠" : "▸"}
          </button>
          <button onClick={onSkip} class="px-3 py-1.5 border rounded">Skip</button>
          <button onClick={onRecheck} class="px-3 py-1.5 border rounded">↻ Re-check</button>
        </div>
      )}
    </article>
  );
}

function ThreadEditor({ body, threadTail, onChange, disabled }: { body: string; threadTail: string[]; onChange: (b: string, t: string[]) => void; disabled: boolean }) {
  const all = [body, ...threadTail];
  const setAt = (idx: number, v: string) => {
    const next = [...all];
    next[idx] = v;
    onChange(next[0]!, next.slice(1));
  };
  const remove = (idx: number) => {
    if (idx === 0) return;
    const next = [...all];
    next.splice(idx, 1);
    onChange(next[0]!, next.slice(1));
  };
  const add = () => onChange(body, [...threadTail, ""]);

  return (
    <div class="space-y-2">
      {all.map((t, i) => (
        <div key={i} class="flex gap-2 items-start">
          <span class="text-xs font-mono mt-2">{i + 1}/{all.length}</span>
          <textarea
            class="flex-1 p-2 bg-bg-1 rounded"
            value={t}
            onChange={(e) => setAt(i, e.currentTarget.value)}
            disabled={disabled}
          />
          {i > 0 && !disabled && <button onClick={() => remove(i)} class="text-red-600">×</button>}
        </div>
      ))}
      {!disabled && <button onClick={add} class="text-sm text-fg-2">+ Add tweet</button>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/DraftCard.tsx
git commit -m "feat(social): DraftCard React island (edit, publish, skip, recheck, thread editor)"
```

---

## Phase 10 — Recovery + smoke + e2e

### Task 30: Recovery script

**Files:**
- Create: `scripts/social-recover.ts`
- Modify: `package.json`

- [ ] **Step 1: Implementation**

```ts
// scripts/social-recover.ts
/**
 * Run from cron every 5 min:
 *   - generating older than 10 min → failed
 *   - sending older than 5 min and externalId IS NULL → pending + retryCount++
 */
import { db } from "~/lib/db";
import { socialPosts } from "~/lib/db/schema";
import { and, eq, sql, isNull, lt } from "drizzle-orm";

const main = async () => {
  const now = new Date();

  const stuckGen = await db.update(socialPosts).set({
    status: "failed",
    errorMessage: "generation timed out",
    updatedAt: now,
  }).where(and(
    eq(socialPosts.status, "generating"),
    lt(socialPosts.createdAt, sql`now() - interval '10 minutes'`),
  )).returning({ id: socialPosts.id });

  const stuckSend = await db.update(socialPosts).set({
    status: "pending",
    retryCount: sql`${socialPosts.retryCount} + 1`,
    updatedAt: now,
  }).where(and(
    eq(socialPosts.status, "sending"),
    isNull(socialPosts.externalId),
    lt(socialPosts.updatedAt, sql`now() - interval '5 minutes'`),
  )).returning({ id: socialPosts.id });

  console.log(JSON.stringify({ recoveredGenerating: stuckGen.length, recoveredSending: stuckSend.length }));
};

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add `"social:recover": "tsx scripts/social-recover.ts"` to package.json**

- [ ] **Step 3: Test (manual)**

Insert a fake `generating` row dated 15 min ago → run `pnpm social:recover` → verify it became `failed`.

- [ ] **Step 4: Commit**

```bash
git add scripts/social-recover.ts package.json
git commit -m "feat(social): recovery script for stuck generating/sending rows"
```

---

### Task 31: Voice draft bootstrap script

**Files:**
- Create: `scripts/voice-draft.ts`
- Modify: `package.json`

- [ ] **Step 1: Implementation (one-shot Sonnet pass on RU corpus)**

```ts
// scripts/voice-draft.ts
/**
 * Reads all RU posts in src/content/posts/, sends to Sonnet asking for a
 * voice profile draft, writes to src/lib/social/voice/profile.draft.md.
 * Operator manually reviews/edits and renames to profile.md.
 */
import Anthropic from "@anthropic-ai/sdk";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const POSTS_DIR = "src/content/posts";

const main = async () => {
  const files = (await readdir(POSTS_DIR)).filter((f) => f.endsWith(".md") && !f.startsWith("e2e-"));
  const corpus = (await Promise.all(files.slice(0, 20).map((f) => readFile(join(POSTS_DIR, f), "utf8")))).join("\n\n---\n\n");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const r = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    messages: [{
      role: "user",
      content: `You are analysing a writer's corpus of blog posts to compose a "voice profile" for an AI editor.

Read the posts, then write a profile.md following this structure exactly:

# Voice profile — Артём Кашута / artka.dev

## What I do
[2-3 sentences]

## Voice
[5-8 bullets]

## Vocabulary I use
[10+ short replacement pairs]

## Topics I have authority in
[list]

## Topics I should NOT make assertions about
[list]

## Opening lines I use
[5-8 actual or characteristic openings]

## Opening lines that drive me crazy (banned)
[5-8 banned openings, mix RU/EN]

CORPUS:
${corpus.slice(0, 60000)}`,
    }],
  });
  const text = r.content.filter((b) => b.type === "text").map((b: any) => b.text).join("");
  const out = "src/lib/social/voice/profile.draft.md";
  await writeFile(out, text);
  console.log(`Draft written to ${out}. Edit it and rename to profile.md.`);
};

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add `"voice:draft": "tsx scripts/voice-draft.ts"` to package.json**

- [ ] **Step 3: Commit**

```bash
git add scripts/voice-draft.ts package.json
git commit -m "feat(social): voice:draft bootstrap script"
```

---

### Task 32: Smoke test script

**Files:**
- Create: `scripts/social-smoke.ts`

- [ ] **Step 1: Implementation**

```ts
// scripts/social-smoke.ts
/**
 * Usage: pnpm social:smoke <slug>
 * Runs the full pipeline against the named post and prints drafts to stdout.
 * Does NOT touch the database, does NOT post to social media.
 */
import { runPipeline } from "~/lib/social/pipeline";
import { loadArticle, decideChannels } from "~/actions/_social";

const main = async () => {
  const slug = process.argv[2];
  if (!slug) { console.error("usage: pnpm social:smoke <slug>"); process.exit(1); }
  const article = await loadArticle(slug);
  const channels = decideChannels(article);
  console.log(`Article: ${article.title}`);
  console.log(`Channels: ${channels.join(", ")}\n`);
  const out = await runPipeline({ article, channels });
  for (const ch of channels) {
    console.log(`\n── ${ch} ──`);
    const r = out.drafts[ch];
    if (r?.ok) {
      console.log(r.value.body);
      if (r.value.threadTail) {
        for (const t of r.value.threadTail) console.log(`\n  ↳ ${t}`);
      }
    } else {
      console.log(`FAILED: ${JSON.stringify(r?.error)}`);
    }
    console.log(`\nNotes:`, out.annotations[ch]);
  }
};

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add to package.json: `"social:smoke": "tsx scripts/social-smoke.ts"`. Step 3: Commit.**

```bash
git add scripts/social-smoke.ts package.json
git commit -m "feat(social): smoke-test CLI (pipeline → stdout, no DB/network)"
```

---

### Task 33: Playwright e2e — happy path

**Files:**
- Create: `test/e2e/social-flow.spec.ts`

- [ ] **Step 1: Test (requires existing e2e infra: admin login fixture, mocked Anthropic)**

```ts
// test/e2e/social-flow.spec.ts
import { test, expect } from "@playwright/test";

test("admin publishes a post and edits + publishes the X-EN draft", async ({ page }) => {
  // 1. login as admin (uses existing storageState fixture)
  await page.goto("/admin/posts/test-post-for-social");

  // 2. click Publish (this is the publish.one action)
  await page.getByRole("button", { name: /^Publish$/ }).click();
  await expect(page.locator(".toast-success")).toContainText("Published");

  // 3. navigate to /admin/social
  await page.goto("/admin/social");
  await expect(page.locator("text=test-post-for-social")).toBeVisible({ timeout: 15_000 });

  // 4. open detail
  await page.getByRole("link", { name: /test-post-for-social/ }).click();
  await expect(page.locator("text=x_en")).toBeVisible();

  // 5. edit X-EN body
  const xCard = page.locator("article").filter({ hasText: "x_en" });
  await xCard.locator("textarea").fill("My polished tweet — fewer than 270 chars.");

  // 6. click Publish on that card
  await xCard.getByRole("button", { name: /^Publish/ }).click();
  await expect(xCard.locator("text=Sent:")).toBeVisible({ timeout: 5_000 });
});
```

> The test relies on Anthropic + X being mocked through msw at the test boundary (set up in `playwright.config.ts` or a global setup file).

- [ ] **Step 2: Run, expect to pass after a few iterations.** Step 3: Commit.

```bash
git add test/e2e/social-flow.spec.ts
git commit -m "test(social): e2e happy-path (publish post → edit X-EN draft → publish)"
```

---

### Task 34: Playwright e2e — error path

**Files:**
- Create: `test/e2e/social-flow-error.spec.ts`

- [ ] **Step 1: Test (msw returns 401 from LinkedIn API)**

```ts
// test/e2e/social-flow-error.spec.ts
import { test, expect } from "@playwright/test";

test("LinkedIn 401 is surfaced as failed with OAuth hint", async ({ page }) => {
  // assume the test setup configures msw to return 401 for LinkedIn
  await page.goto("/admin/social/test-post-for-social");
  const liCard = page.locator("article").filter({ hasText: "li_en" });
  await liCard.getByRole("button", { name: /^Publish/ }).click();
  await expect(liCard.locator("text=Error:")).toContainText(/401|policy|OAuth/i, { timeout: 5_000 });
});
```

- [ ] **Step 2-3: Run + commit.**

```bash
git add test/e2e/social-flow-error.spec.ts
git commit -m "test(social): e2e error-path (LinkedIn 401 → failed with OAuth hint)"
```

---

## Phase 11 — Cutover

### Task 35: Final docs + .env.example tidy

**Files:**
- Modify: `.env.example` (already done in Task 4 — verify completeness)
- Create: `docs/admin/social-cutover.md`

- [ ] **Step 1: Cutover doc**

Brief Markdown doc covering:
1. Run migration: `pnpm db:migrate`
2. Bootstrap voice: `pnpm voice:draft` → edit `profile.draft.md` → rename to `profile.md` → commit
3. OAuth: `pnpm social:auth:x`, `pnpm social:auth:linkedin`, paste tokens to `.env`
4. Telegram: create bot via @BotFather, add to channel as admin, set `TELEGRAM_*`
5. Feature flag: dev `=true`, prod start `=false` for one trial run
6. First publish test path (with `draft: true` post)
7. Watch for 5 publications, calibrate prompts/banned-phrases
8. Set up cron for `pnpm social:recover` every 5 min

- [ ] **Step 2: Commit**

```bash
git add docs/admin/social-cutover.md
git commit -m "docs(social): cutover playbook"
```

---

### Task 36: README admin section update

**Files:**
- Modify: `README.md` or admin section thereof

- [ ] **Step 1: Add a brief social autopost section** with a link to `docs/admin/social-cutover.md`. Step 2: Commit `docs(readme): add social autopost section`.

---

## Self-Review

### Spec coverage check

- [x] Outbox `socialPosts` table → Task 1
- [x] Channel/status enums → Task 1
- [x] Hash-based supersede → Tasks 1, 17, 19
- [x] Functional error model → Task 3
- [x] Feature flag → Task 4
- [x] Voice card files → Task 5
- [x] Voice loader with memoisation → Task 6
- [x] MarkdownV2 escape/validate → Task 7
- [x] Retry helper → Task 8
- [x] Anthropic test fixtures → Task 9
- [x] Writers: x-en (single+thread), li-en (1300-1900 + AI-disclosure), tg-ru (MarkdownV2) → Tasks 10, 11, 12
- [x] Editors mirroring writers, preserving type/disclosure → Tasks 13, 14, 15
- [x] Critic (read-only, batch) → Task 16
- [x] Source hash + article loader + decideChannels → Task 17
- [x] Pipeline orchestrator → Task 18
- [x] Action `socialDrafts.generate` (transactional, void pipeline) → Task 19
- [x] Hook in publish.one (gated by feature flag, posts only) → Task 20
- [x] Clients X / LinkedIn / Telegram → Tasks 21, 22, 23
- [x] OAuth CLIs → Task 24
- [x] Action `publish` (atomic pending→sending, force override) → Task 25
- [x] Actions save / skip / recheck / regenerate → Task 26
- [x] Admin list page → Task 27
- [x] Admin detail page → Task 28
- [x] DraftCard React island (with thread editor) → Task 29
- [x] Recovery script → Task 30
- [x] Voice bootstrap → Task 31
- [x] Smoke CLI → Task 32
- [x] E2E happy + error → Tasks 33, 34
- [x] Cutover doc + README → Tasks 35, 36

### Placeholder scan

- Tasks 14 and 15 (LinkedIn / Telegram editors) say "mirror Task 13" — this is acceptable here because the structure is genuinely identical save for explicit channel constants and the documented per-task differences (validation step, schema bounds). Engineers are not expected to read tasks out of order; if needed they can copy code from Task 13 and substitute. **Verify before finalising.** If the engineer is uncomfortable, expand Tasks 14 and 15 to repeat the full code in-line.
- Task 22 and 23 (LinkedIn / Telegram clients) similarly delegate to Task 21's pattern. Same caveat — if maintainability is paramount, expand inline.
- Decision: keep terse. The tasks are explicitly bite-sized; an engineer copy-pasting Task 21 with channel/URL substitutions is the expected workflow.

### Type consistency

- `Article` shape consistent across loader, writers, editors, critic, pipeline.
- `Draft` shape: `{ body, threadTail?, mediaUrl }` — unchanged across writer/editor/persistence.
- `CriticNote` shape consistent in types, schema, critic, DraftCard rendering.
- `Result<T>` and error factories used consistently.
- Action input schemas use `z.literal("posts")` consistently.

### Risks during execution (callouts)

1. **Anthropic SDK API drift.** The fixture format must match the actual response shape. If `messages.create` shape changes between SDK versions, fixtures need re-recording (`pnpm test --update-fixtures`).
2. **Drizzle tx semantics.** The supersede + insert in Task 19 uses a transaction. Verify on Postgres 18 that `ON CONFLICT DO NOTHING` plays nice with the partial unique index.
3. **Astro Action `callAction` from a server context.** Task 20 calls `socialDrafts.generate.handler(...)` directly with `context`. If this pattern is not the codebase's convention, replace with `await Astro.callAction(actions.socialDrafts.generate, ...)`.
4. **MarkdownV2 escape walker** in Task 7 — fiddly, may need iteration. The unit tests catch most cases.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-09-social-autopost.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
