import { ActionError, defineAction } from "astro:actions";
import type { ActionAPIContext } from "astro:actions";
import { z } from "astro/zod";
import { and, eq, ne, notInArray } from "drizzle-orm";
import { assertAdmin } from "./_auth.js";
import { computeSourceHash, decideChannels, loadArticle } from "./_social.js";
import { db } from "~/lib/db";
import { socialPosts } from "~/lib/db/schema";
import {
  CRITIC_MODEL,
  EDITOR_MODEL,
  WRITER_MODEL,
  isSocialEnabled,
  validateSocialEnv,
} from "~/lib/social/config.js";
import { stringifyError } from "~/lib/social/errors.js";
import { runPipeline } from "~/lib/social/pipeline.js";
import { runCritic } from "~/lib/social/critic.js";
import type { CriticNote, SocialChannel } from "~/lib/social/types.js";
import { logger as log } from "~/lib/logger";
import { postTweet, postThread } from "~/lib/social/clients/x.js";
import { postShare } from "~/lib/social/clients/linkedin.js";
import { sendMessage as tgSend } from "~/lib/social/clients/telegram.js";
import { withRetry } from "~/lib/social/retry.js";

// ── Terminal statuses that must never be superseded or re-inserted ────────────

const TERMINAL_STATUSES = ["sent", "sending", "superseded", "skipped", "failed"] as const;

// ── Persist pipeline results back to rows that are still in "generating" ─────

const persistResults = async (
  collection: "posts",
  slug: string,
  sourceHash: string,
  output: Awaited<ReturnType<typeof runPipeline>>,
): Promise<void> => {
  const channels = Object.keys(output.drafts) as SocialChannel[];
  for (const ch of channels) {
    const r = output.drafts[ch];
    if (!r) continue;
    if (r.ok) {
      await db
        .update(socialPosts)
        .set({
          body: r.value.body,
          threadTail: r.value.threadTail ?? null,
          mediaUrl: r.value.mediaUrl,
          criticAnnotations: output.annotations[ch] ?? [],
          generationModel: WRITER_MODEL,
          editorModel: EDITOR_MODEL,
          criticModel: CRITIC_MODEL,
          status: "pending",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(socialPosts.postCollection, collection),
            eq(socialPosts.postSlug, slug),
            eq(socialPosts.channel, ch),
            eq(socialPosts.sourceHash, sourceHash),
            eq(socialPosts.status, "generating"),
          ),
        );
    } else {
      await db
        .update(socialPosts)
        .set({
          status: "failed",
          errorMessage: stringifyError(r.error),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(socialPosts.postCollection, collection),
            eq(socialPosts.postSlug, slug),
            eq(socialPosts.channel, ch),
            eq(socialPosts.sourceHash, sourceHash),
            eq(socialPosts.status, "generating"),
          ),
        );
    }
  }
};

// ── Handler (plain function — callable in tests without Astro runtime) ────────

export type GenerateInput = {
  slug: string;
  collection: "posts";
  channels?: SocialChannel[] | undefined;
};

export type GenerateResult =
  { ok: true; channels: SocialChannel[] } | { ok: false; reason: string };

export const generateHandler = async (
  { slug, collection, channels }: GenerateInput,
  ctx: ActionAPIContext,
): Promise<GenerateResult> => {
  assertAdmin(ctx.locals.user as { role?: string | null } | null);

  if (!isSocialEnabled()) {
    log.warn({ mod: "social", slug }, "generate skipped: feature flag off");
    return { ok: false as const, reason: "feature flag off" };
  }

  const env = validateSocialEnv();
  if (!env.ok) {
    log.error({ mod: "social", slug, issues: env.issues }, "social env invalid");
    return { ok: false as const, reason: `env invalid: ${env.issues.join("; ")}` };
  }

  const article = await loadArticle(slug, collection);
  const sourceHash = computeSourceHash({
    title: article.title,
    body: article.body,
    frontmatter: {
      tags: article.tags,
      lang: article.lang,
      pubDate: article.pubDate.toISOString(),
    },
  });
  const channelsToUse: SocialChannel[] = channels ?? decideChannels(article);

  // ── Idempotency guard: skip if non-terminal rows already exist for this exact
  //    source hash. Prevents wasted LLM tokens on repeat clicks of Publish/Force.
  const existing = await db
    .select({ id: socialPosts.id })
    .from(socialPosts)
    .where(
      and(
        eq(socialPosts.postCollection, collection),
        eq(socialPosts.postSlug, slug),
        eq(socialPosts.sourceHash, sourceHash),
        notInArray(socialPosts.status, ["failed", "superseded", "skipped"]),
      ),
    );
  if (existing.length > 0) {
    log.info(
      { mod: "social", slug, existing: existing.length },
      "kickoff skipped: same sourceHash already in flight or sent",
    );
    return { ok: true, channels: [] };
  }

  // ── Transactional outbox: supersede stale rows + insert new generating rows

  await db.transaction(async (tx) => {
    // 1. Mark rows with a different hash that are not yet in a terminal
    //    state as superseded — keeps history clean without data loss.
    await tx
      .update(socialPosts)
      .set({ status: "superseded", updatedAt: new Date() })
      .where(
        and(
          eq(socialPosts.postCollection, collection),
          eq(socialPosts.postSlug, slug),
          ne(socialPosts.sourceHash, sourceHash),
          notInArray(socialPosts.status, [...TERMINAL_STATUSES]),
        ),
      );

    // 2. Insert a "generating" placeholder for each channel.
    //    onConflictDoNothing respects the partial unique index
    //    ux_social_active_per_channel — if an active row already exists for
    //    this (collection, slug, channel) combination we skip silently.
    for (const channel of channelsToUse) {
      await tx
        .insert(socialPosts)
        .values({
          postCollection: collection,
          postSlug: slug,
          channel,
          sourceHash,
          status: "generating",
          body: "",
          createdById: (ctx.locals.user as { id?: string } | null)?.id ?? null,
        })
        .onConflictDoNothing();
    }
  });

  // ── Fire-and-forget pipeline — crashes are logged; rows stay in
  //    "generating" and a recovery cron will pick them up.

  log.info({ mod: "social", slug, channels: channelsToUse }, "pipeline kickoff");
  void runPipeline({ article, channels: channelsToUse })
    .then((out) => {
      log.info({ mod: "social", slug, channels: Object.keys(out.drafts) }, "pipeline done");
      return persistResults(collection, slug, sourceHash, out);
    })
    .catch((err) =>
      log.error({ mod: "social", slug, err }, "pipeline crashed — rows left in generating"),
    );

  return { ok: true, channels: channelsToUse };
};

// ── Send a single row by channel — wrapped in withRetry for 5xx/429 ──────────

type SendResult = ReturnType<typeof postTweet>;

const sendByChannel = (row: typeof socialPosts.$inferSelect): SendResult => {
  const fn = async () => {
    if (row.channel === "x_en") {
      if (row.threadTail && row.threadTail.length > 0) {
        return postThread([row.body, ...row.threadTail]);
      }
      return postTweet({ text: row.body });
    }
    if (row.channel === "li_en") return postShare({ text: row.body });
    return tgSend({ text: row.body, mediaUrl: row.mediaUrl });
  };
  return withRetry(fn, { maxAttempts: 3, baseDelayMs: 2000 });
};

// ── Publish handler ──────────────────────────────────────────────────────────

const hasBlockNote = (notes: unknown): boolean =>
  Array.isArray(notes) && notes.some((n) => (n as { severity?: string }).severity === "block");

export type PublishInput = { id: string; force: boolean };
export type PublishResult = { ok: true; url: string } | { ok: false; error: string };

const requireSocialEnabled = (): void => {
  if (!isSocialEnabled()) {
    throw new ActionError({ code: "FORBIDDEN", message: "social autopost is disabled" });
  }
};

export const publishHandler = async (
  { id, force }: PublishInput,
  ctx: ActionAPIContext,
): Promise<PublishResult> => {
  assertAdmin(ctx.locals.user as { role?: string | null } | null);
  requireSocialEnabled();
  const env = validateSocialEnv();
  if (!env.ok) {
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: `social env invalid: ${env.issues.join("; ")}`,
    });
  }

  // Atomic pending → sending
  const [row] = await db
    .update(socialPosts)
    .set({
      status: "sending",
      approvedById: (ctx.locals.user as { id?: string } | null)?.id ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(socialPosts.id, id), eq(socialPosts.status, "pending")))
    .returning();

  if (!row) {
    throw new ActionError({ code: "CONFLICT", message: "Draft is not pending" });
  }

  if (!force && hasBlockNote(row.criticAnnotations)) {
    // Roll back to pending
    await db
      .update(socialPosts)
      .set({ status: "pending", updatedAt: new Date() })
      .where(eq(socialPosts.id, id));
    throw new ActionError({
      code: "BAD_REQUEST",
      message: "block-level critic notes; resubmit with force=true",
    });
  }

  const result = await sendByChannel(row);

  if (result.ok) {
    await db
      .update(socialPosts)
      .set({
        status: "sent",
        externalId: result.value.id,
        externalUrl: result.value.url,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(socialPosts.id, id));
    return { ok: true, url: result.value.url };
  }

  await db
    .update(socialPosts)
    .set({
      status: "failed",
      errorMessage: stringifyError(result.error),
      retryCount: row.retryCount + 1,
      updatedAt: new Date(),
    })
    .where(eq(socialPosts.id, id));
  return { ok: false, error: stringifyError(result.error) };
};

// ── Save (update body / threadTail of pending row) ────────────────────────────

export type SaveInput = { id: string; body: string; threadTail?: string[] | undefined };

export const saveHandler = async (
  { id, body, threadTail }: SaveInput,
  ctx: ActionAPIContext,
): Promise<{ ok: true }> => {
  assertAdmin(ctx.locals.user as { role?: string | null } | null);
  requireSocialEnabled();
  await db
    .update(socialPosts)
    .set({
      body,
      threadTail: threadTail ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(socialPosts.id, id), eq(socialPosts.status, "pending")));
  return { ok: true };
};

// ── Skip (mark pending row as skipped) ────────────────────────────────────────

export type SkipInput = { id: string; reason?: string | undefined };

export const skipHandler = async (
  { id, reason }: SkipInput,
  ctx: ActionAPIContext,
): Promise<{ ok: true }> => {
  assertAdmin(ctx.locals.user as { role?: string | null } | null);
  requireSocialEnabled();
  await db
    .update(socialPosts)
    .set({
      status: "skipped",
      errorMessage: reason ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(socialPosts.id, id), eq(socialPosts.status, "pending")));
  return { ok: true };
};

// ── Recheck (re-run Critic, update annotations) ──────────────────────────────

export type RecheckInput = { id: string };
export type RecheckResult = { ok: true; annotations: CriticNote[] };

export const recheckHandler = async (
  { id }: RecheckInput,
  ctx: ActionAPIContext,
): Promise<RecheckResult> => {
  assertAdmin(ctx.locals.user as { role?: string | null } | null);
  requireSocialEnabled();
  const [row] = await db.select().from(socialPosts).where(eq(socialPosts.id, id));
  if (!row) throw new ActionError({ code: "NOT_FOUND", message: "draft not found" });

  const article = await loadArticle(row.postSlug);
  const annotations = await runCritic(article, [
    {
      channel: row.channel,
      draft: {
        body: row.body,
        ...(row.threadTail != null ? { threadTail: row.threadTail } : {}),
        mediaUrl: row.mediaUrl,
      },
    },
  ]);
  const channelNotes: CriticNote[] = (annotations[row.channel] ?? []) as CriticNote[];

  await db
    .update(socialPosts)
    .set({
      criticAnnotations: channelNotes,
      criticModel: CRITIC_MODEL,
      updatedAt: new Date(),
    })
    .where(eq(socialPosts.id, id));

  return { ok: true, annotations: channelNotes };
};

// ── Regenerate (supersede + invoke generate) ─────────────────────────────────

export type RegenerateInput = { slug: string; collection: "posts" };

export const regenerateHandler = async (
  { slug, collection }: RegenerateInput,
  ctx: ActionAPIContext,
): Promise<GenerateResult> => {
  assertAdmin(ctx.locals.user as { role?: string | null } | null);
  requireSocialEnabled();
  await db
    .update(socialPosts)
    .set({ status: "superseded", updatedAt: new Date() })
    .where(
      and(
        eq(socialPosts.postCollection, collection),
        eq(socialPosts.postSlug, slug),
        notInArray(socialPosts.status, [...TERMINAL_STATUSES]),
      ),
    );
  return generateHandler({ slug, collection }, ctx);
};

// ── Action ────────────────────────────────────────────────────────────────────

export const socialDrafts = {
  generate: defineAction({
    accept: "json",
    input: z.object({
      slug: z.string().min(1),
      collection: z.literal("posts").default("posts"),
      channels: z.array(z.enum(["x_en", "li_en", "tg_ru"])).optional(),
    }),
    handler: async (input, ctx) => generateHandler(input, ctx),
  }),
  publish: defineAction({
    accept: "json",
    input: z.object({
      id: z.uuid(),
      force: z.boolean().default(false),
    }),
    handler: async (input, ctx) =>
      publishHandler({ id: input.id, force: input.force ?? false }, ctx),
  }),
  save: defineAction({
    accept: "json",
    input: z.object({
      id: z.uuid(),
      body: z.string(),
      threadTail: z.array(z.string()).optional(),
    }),
    handler: async (input, ctx) => saveHandler(input, ctx),
  }),
  skip: defineAction({
    accept: "json",
    input: z.object({
      id: z.uuid(),
      reason: z.string().optional(),
    }),
    handler: async (input, ctx) => skipHandler(input, ctx),
  }),
  recheck: defineAction({
    accept: "json",
    input: z.object({ id: z.uuid() }),
    handler: async (input, ctx) => recheckHandler(input, ctx),
  }),
  regenerate: defineAction({
    accept: "json",
    input: z.object({
      slug: z.string().min(1),
      collection: z.literal("posts").default("posts"),
    }),
    handler: async (input, ctx) => regenerateHandler(input, ctx),
  }),
};
