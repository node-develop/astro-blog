/**
 * Social drafts as plain functions with explicit inputs: no Astro context, no admin check. Callers
 * (the Astro Actions in src/actions/socialDrafts.ts, the content API routes, the worker hooks)
 * decide who may call; the person behind a call is the `actor`. Failures are `apiError`s with a
 * stable `code`; a caller maps them to its own transport.
 *
 * Checks stay as they were in the actions: the feature flag guards every function, the full env
 * validation only the two that talk to the networks (kickoff, publish), so a draft can still be
 * edited or skipped while an unrelated credential is misconfigured.
 */
import { and, eq, gt, inArray, ne, notInArray, or } from "drizzle-orm";
import { apiError } from "../content-api/errors";
import { db } from "../db";
import { socialPosts, type SocialPost } from "../db/schema";
import { logger as log } from "../logger";
import { postShare } from "./clients/linkedin";
import { sendMessage as tgSend } from "./clients/telegram";
import { postThread, postTweet } from "./clients/x";
import {
  CRITIC_MODEL,
  EDITOR_MODEL,
  WRITER_MODEL,
  isSocialEnabled,
  validateSocialEnv,
} from "./config";
import {
  computeSourceHash,
  decideChannels,
  loadArticle,
  loadArticleOrFile,
  type ArticleSource,
} from "./article";
import { hasBlockNote } from "./critic-notes";
import { runCritic } from "./critic";
import { stringifyError } from "./errors";
import { runPipeline } from "./pipeline";
import { withRetry } from "./retry";
import type { Article, CriticNote, SocialChannel } from "./types";

const COLLECTION = "posts" as const;
/** Rows in these states are never superseded by a new source hash. */
const TERMINAL_STATUSES = ["sent", "sending", "superseded", "skipped", "failed"] as const;

/** Who is calling: the signed-in person, or null for an API key or the worker. */
export type Actor = Readonly<{ userId: string | null }>;

const requireEnabled = (): void => {
  if (!isSocialEnabled()) throw apiError(403, "social_disabled", "social autopost is disabled");
};
const envProblem = (): string | null => {
  const env = validateSocialEnv();
  return env.ok ? null : env.issues.join("; ");
};

// ── Persist pipeline results back to rows that are still in "generating" ─────

const persistResults = async (
  slug: string,
  sourceHash: string,
  output: Awaited<ReturnType<typeof runPipeline>>,
): Promise<void> => {
  const channels = Object.keys(output.drafts) as SocialChannel[];
  for (const channel of channels) {
    const result = output.drafts[channel];
    if (!result) continue;
    const generating = and(
      eq(socialPosts.postCollection, COLLECTION),
      eq(socialPosts.postSlug, slug),
      eq(socialPosts.channel, channel),
      eq(socialPosts.sourceHash, sourceHash),
      eq(socialPosts.status, "generating"),
    );
    if (result.ok) {
      await db
        .update(socialPosts)
        .set({
          body: result.value.body,
          threadTail: result.value.threadTail ?? null,
          mediaUrl: result.value.mediaUrl,
          criticAnnotations: output.annotations[channel] ?? [],
          generationModel: WRITER_MODEL,
          editorModel: EDITOR_MODEL,
          criticModel: CRITIC_MODEL,
          status: "pending",
          updatedAt: new Date(),
        })
        .where(generating);
    } else {
      await db
        .update(socialPosts)
        .set({
          status: "failed",
          errorMessage: stringifyError(result.error),
          updatedAt: new Date(),
        })
        .where(generating);
    }
  }
};

// ── Kickoff ──────────────────────────────────────────────────────────────────

export type KickoffInput = Readonly<{
  slug: string;
  /** Explicit channels override the "declined" rule below; omitted: the channels that fit. */
  channels?: readonly SocialChannel[] | undefined;
  actor: Actor;
  /** `file`: read the RU file (publish.one); default `auto`: the published API article, else the file. */
  source?: ArticleSource | undefined;
  /** Already loaded by the caller (regenerate); then `source` is not read. */
  article?: Article | undefined;
}>;
export type KickoffResult =
  | { ok: true; channels: SocialChannel[] }
  | { ok: false; code: "social_disabled" | "social_not_configured"; reason: string };

/**
 * Creates the drafts that do not exist yet for this exact article text, per channel.
 *
 * A channel is skipped when it already has a live row for the slug (the partial unique index
 * `ux_social_active_per_channel`: generating, pending, sending, sent). That is what lets the EN
 * publication, which arrives after the RU one, add x_en and li_en without a second tg_ru.
 * When the channels are not named, a channel whose draft was skipped by a person, or whose send
 * failed, for this same text is not brought back either; naming it (or `regenerate`) does.
 */
export const kickoffSocial = async ({
  slug,
  channels,
  actor,
  source = "auto",
  article: preloaded,
}: KickoffInput): Promise<KickoffResult> => {
  if (!isSocialEnabled()) {
    log.warn({ mod: "social", slug }, "generate skipped: feature flag off");
    return { ok: false, code: "social_disabled", reason: "feature flag off" };
  }
  const env = validateSocialEnv();
  if (!env.ok) {
    log.error({ mod: "social", slug, issues: env.issues }, "social env invalid");
    return {
      ok: false,
      code: "social_not_configured",
      reason: `env invalid: ${env.issues.join("; ")}`,
    };
  }

  const article = preloaded ?? (await loadArticle(slug, source));
  const sourceHash = computeSourceHash({
    title: article.title,
    body: article.body,
    frontmatter: {
      tags: article.tags,
      lang: article.lang,
      pubDate: article.pubDate.toISOString(),
    },
  });
  const requested: SocialChannel[] = channels ? [...channels] : decideChannels(article);

  const created = await db.transaction(async (tx) => {
    // Rows of an older text that are not finished: superseded, history kept.
    await tx
      .update(socialPosts)
      .set({ status: "superseded", updatedAt: new Date() })
      .where(
        and(
          eq(socialPosts.postCollection, COLLECTION),
          eq(socialPosts.postSlug, slug),
          ne(socialPosts.sourceHash, sourceHash),
          notInArray(socialPosts.status, [...TERMINAL_STATUSES]),
        ),
      );
    const declined = channels
      ? []
      : await tx
          .select({ channel: socialPosts.channel })
          .from(socialPosts)
          .where(
            and(
              eq(socialPosts.postCollection, COLLECTION),
              eq(socialPosts.postSlug, slug),
              eq(socialPosts.sourceHash, sourceHash),
              or(
                eq(socialPosts.status, "skipped"),
                and(eq(socialPosts.status, "failed"), gt(socialPosts.retryCount, 0)),
              ),
            ),
          );
    const wanted = requested.filter((channel) => !declined.some((d) => d.channel === channel));
    if (wanted.length === 0) return [];
    // The unique index makes this per channel: a channel that is already live is not inserted.
    const inserted = await tx
      .insert(socialPosts)
      .values(
        wanted.map((channel) => ({
          postCollection: COLLECTION,
          postSlug: slug,
          channel,
          sourceHash,
          status: "generating" as const,
          body: "",
          createdById: actor.userId,
        })),
      )
      .onConflictDoNothing()
      .returning({ channel: socialPosts.channel });
    return inserted.map((row) => row.channel);
  });

  if (created.length === 0) {
    log.info(
      { mod: "social", slug, requested },
      "kickoff created nothing: channels already covered",
    );
    return { ok: true, channels: [] };
  }

  // Fire-and-forget pipeline: a crash is logged and the rows stay in "generating".
  log.info({ mod: "social", slug, channels: created }, "pipeline kickoff");
  void runPipeline({ article, channels: created })
    .then((out) => {
      log.info({ mod: "social", slug, channels: Object.keys(out.drafts) }, "pipeline done");
      return persistResults(slug, sourceHash, out);
    })
    .catch((err) =>
      log.error({ mod: "social", slug, err }, "pipeline crashed — rows left in generating"),
    );
  return { ok: true, channels: created };
};

// ── Publish ──────────────────────────────────────────────────────────────────

const sendByChannel = (row: SocialPost) => {
  const send = async () => {
    if (row.channel === "x_en") {
      if (row.threadTail && row.threadTail.length > 0) {
        return postThread([row.body, ...row.threadTail]);
      }
      return postTweet({ text: row.body });
    }
    if (row.channel === "li_en") return postShare({ text: row.body });
    return tgSend({ text: row.body, mediaUrl: row.mediaUrl });
  };
  return withRetry(send, { maxAttempts: 3, baseDelayMs: 2000 });
};

/** The row after the call; a missing row is 404, any other state than `pending` is 409. */
const notPending = async (id: string) => {
  const [row] = await db
    .select({ id: socialPosts.id })
    .from(socialPosts)
    .where(eq(socialPosts.id, id));
  return row
    ? apiError(409, "draft_not_pending", "Draft is not pending")
    : apiError(404, "not_found", "draft not found");
};

export type PublishDraftResult =
  { ok: true; draft: SocialPost; url: string } | { ok: false; draft: SocialPost; error: string };

/**
 * pending → sending → sent | failed. A draft the critic marked `block` needs `force`; this is the
 * only place that rule lives.
 */
export const publishDraft = async ({
  id,
  force,
  actor,
}: Readonly<{ id: string; force: boolean; actor: Actor }>): Promise<PublishDraftResult> => {
  requireEnabled();
  const problem = envProblem();
  if (problem) throw apiError(503, "social_not_configured", `social env invalid: ${problem}`);

  // Atomic pending → sending
  const [row] = await db
    .update(socialPosts)
    .set({ status: "sending", approvedById: actor.userId, updatedAt: new Date() })
    .where(and(eq(socialPosts.id, id), eq(socialPosts.status, "pending")))
    .returning();
  if (!row) throw await notPending(id);

  if (!force && hasBlockNote(row.criticAnnotations)) {
    await db
      .update(socialPosts)
      .set({ status: "pending", updatedAt: new Date() })
      .where(eq(socialPosts.id, id));
    throw apiError(409, "critic_block", "block-level critic notes; resubmit with force=true");
  }

  const result = await sendByChannel(row);
  if (result.ok) {
    const [sent] = await db
      .update(socialPosts)
      .set({
        status: "sent",
        externalId: result.value.id,
        externalUrl: result.value.url,
        sentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(socialPosts.id, id))
      .returning();
    return { ok: true, draft: sent!, url: result.value.url };
  }
  const error = stringifyError(result.error);
  const [failed] = await db
    .update(socialPosts)
    .set({
      status: "failed",
      errorMessage: error,
      retryCount: row.retryCount + 1,
      updatedAt: new Date(),
    })
    .where(eq(socialPosts.id, id))
    .returning();
  return { ok: false, draft: failed!, error };
};

// ── Save / skip (pending rows only) ──────────────────────────────────────────

export const saveDraft = async ({
  id,
  body,
  threadTail,
}: Readonly<{
  id: string;
  body: string;
  threadTail?: readonly string[] | undefined;
}>): Promise<SocialPost> => {
  requireEnabled();
  const [row] = await db
    .update(socialPosts)
    .set({ body, threadTail: threadTail ? [...threadTail] : null, updatedAt: new Date() })
    .where(and(eq(socialPosts.id, id), eq(socialPosts.status, "pending")))
    .returning();
  if (!row) throw await notPending(id);
  return row;
};

export const skipDraft = async ({
  id,
  reason,
}: Readonly<{ id: string; reason?: string | undefined }>): Promise<SocialPost> => {
  requireEnabled();
  const [row] = await db
    .update(socialPosts)
    .set({ status: "skipped", errorMessage: reason ?? null, updatedAt: new Date() })
    .where(and(eq(socialPosts.id, id), eq(socialPosts.status, "pending")))
    .returning();
  if (!row) throw await notPending(id);
  return row;
};

// ── Recheck (re-run the critic, update annotations) ──────────────────────────

export const recheckDraft = async ({
  id,
}: Readonly<{ id: string }>): Promise<{ draft: SocialPost; annotations: CriticNote[] }> => {
  requireEnabled();
  const [row] = await db.select().from(socialPosts).where(eq(socialPosts.id, id));
  if (!row) throw apiError(404, "not_found", "draft not found");

  // Only grades an existing draft, so a draft made from a file still rechecks.
  const article = await loadArticleOrFile(row.postSlug);
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
  const channelNotes = (annotations[row.channel] ?? []) as CriticNote[];
  const [draft] = await db
    .update(socialPosts)
    .set({ criticAnnotations: channelNotes, criticModel: CRITIC_MODEL, updatedAt: new Date() })
    .where(eq(socialPosts.id, id))
    .returning();
  return { draft: draft!, annotations: channelNotes };
};

// ── Supersede ────────────────────────────────────────────────────────────────

/** Unfinished drafts (generating, pending) of `channels` for the slug become superseded. */
export const supersedeDrafts = async (
  slug: string,
  channels?: readonly SocialChannel[],
): Promise<number> => {
  const rows = await db
    .update(socialPosts)
    .set({ status: "superseded", updatedAt: new Date() })
    .where(
      and(
        eq(socialPosts.postCollection, COLLECTION),
        eq(socialPosts.postSlug, slug),
        notInArray(socialPosts.status, [...TERMINAL_STATUSES]),
        channels ? inArray(socialPosts.channel, [...channels]) : undefined,
      ),
    )
    .returning({ id: socialPosts.id });
  return rows.length;
};

/** Supersede the unfinished drafts, then generate every channel that fits afresh (declined ones included). */
export const regenerate = async ({
  slug,
  actor,
}: Readonly<{ slug: string; actor: Actor }>): Promise<KickoffResult> => {
  requireEnabled();
  const problem = envProblem();
  if (problem)
    return { ok: false, code: "social_not_configured", reason: `env invalid: ${problem}` };
  const article = await loadArticleOrFile(slug);
  await supersedeDrafts(slug);
  return kickoffSocial({ slug, channels: decideChannels(article), actor, article });
};
