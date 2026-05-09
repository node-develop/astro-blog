import { ActionError, defineAction } from "astro:actions";
import type { ActionAPIContext } from "astro:actions";
import { z } from "astro:schema";
import { and, eq, ne, notInArray } from "drizzle-orm";
import { assertAdmin } from "./_auth.js";
import { computeSourceHash, decideChannels, loadArticle } from "./_social.js";
import { db } from "~/lib/db";
import { socialPosts } from "~/lib/db/schema";
import { CRITIC_MODEL, EDITOR_MODEL, WRITER_MODEL, isSocialEnabled } from "~/lib/social/config.js";
import { stringifyError } from "~/lib/social/errors.js";
import { runPipeline } from "~/lib/social/pipeline.js";
import type { SocialChannel } from "~/lib/social/types.js";
import { logger as log } from "~/lib/logger";

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
  | { ok: true; channels: SocialChannel[] }
  | { ok: false; reason: string };

export const generateHandler = async (
  { slug, collection, channels }: GenerateInput,
  ctx: ActionAPIContext,
): Promise<GenerateResult> => {
  assertAdmin(ctx.locals.user as { role?: string | null } | null);

  if (!isSocialEnabled()) {
    return { ok: false as const, reason: "feature flag off" };
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

  void runPipeline({ article, channels: channelsToUse })
    .then((out) => persistResults(collection, slug, sourceHash, out))
    .catch((err) =>
      log.error({ mod: "social", slug, err }, "pipeline crashed — rows left in generating"),
    );

  return { ok: true, channels: channelsToUse };
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
};
