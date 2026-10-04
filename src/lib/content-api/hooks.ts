/**
 * Post-publication hooks: IndexNow and social drafts. Run by the worker route AFTER the
 * publication step, never inside it: they do network and model work that takes seconds, and the
 * publication transaction holds the content advisory lock.
 *
 * Claiming (exactly once). A publication waits for its hooks while `state = 'published' AND
 * hooks_done_at IS NULL`. A short transaction takes one such row with `FOR UPDATE SKIP LOCKED`
 * (a concurrent worker call skips it) and leases it by pushing `next_attempt_at` 5 minutes ahead;
 * the transaction commits, and the hooks run with no lock and no transaction. At the end
 * `hooks_done_at` is set. `next_attempt_at` of a published row is otherwise unused and is not part of
 * `publicationView`; neither the lease nor the done mark touches `updated_at`, which the API
 * exposes and the FIFO order uses. A call that dies mid-hooks leaves the lease to expire: the
 * hooks run again after 5 minutes, which is safe (kickoff is idempotent per channel, a repeated
 * IndexNow ping is harmless).
 *
 * Retries live inside one call: up to 3 attempts, 1 s and 2 s apart. An outage longer than that
 * loses the ping (it is logged as an error) and the publication is still marked done: a hook error
 * never fails a publication and never blocks the queue. No migration for a retry counter.
 *
 * What runs for which publication:
 *  - `publish`: IndexNow for the page (plus the EN page when an EN twin is live or in the group),
 *    and, when SOCIAL_DRAFTS_ENABLED, the social kickoff for the slug. Kickoff is per channel, so
 *    the later EN publication is what adds x_en and li_en.
 *  - `unpublish`: IndexNow too (a removed URL is worth announcing); no kickoff, and the unfinished
 *    drafts of the affected channels are superseded so nobody can post a link to a gone page.
 *
 * A batch (RU + EN requested together, one `batch_id`) is claimed as one group once no member is
 * still queued or publishing: one IndexNow ping and one kickoff for the pair.
 * Two concurrent calls can still split a batch (each sees the other's row locked); each
 * publication's hooks then run once, the slug may be pinged twice.
 */
import { and, asc, eq, inArray, isNotNull, isNull, lte, ne, notExists } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db";
import { contentArticles, contentPublications } from "../db/schema";
import { logger } from "../logger";
import { isSocialEnabled } from "../social/config";
import { hasEnTwin } from "../social/article";
import { kickoffSocial, supersedeDrafts } from "../social/service";
import { pingIndexNow, type IndexNowOutcome } from "../seo/indexnow";
import type { SocialChannel } from "../social/types";
import { isApiError } from "./errors";

export const HOOK_LEASE_MS = 5 * 60_000;
export const HOOK_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 1_000;

export type SlugHooksReport = Readonly<{
  slug: string;
  indexNow: IndexNowOutcome;
  /** `none`: nothing to do (unpublish, or the flag is off); `skipped`: refused, retrying cannot help. */
  social: "done" | "skipped" | "failed" | "none";
}>;
export type HooksReport = Readonly<{
  publicationIds: readonly string[];
  slugs: readonly SlugHooksReport[];
}>;

type Publication = typeof contentPublications.$inferSelect;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Claims one publication, plus its batch neighbours that are also waiting; null when none is due. */
const claim = async (): Promise<readonly Publication[] | null> =>
  db.transaction(async (tx) => {
    const now = new Date();
    const neighbour = alias(contentPublications, "neighbour");
    const waiting = and(
      eq(contentPublications.state, "published"),
      isNull(contentPublications.hooksDoneAt),
      lte(contentPublications.nextAttemptAt, now),
    );
    const [first] = await tx
      .select()
      .from(contentPublications)
      .where(
        and(
          waiting,
          // A batch waits until every member has finished publishing.
          notExists(
            tx
              .select({ id: neighbour.id })
              .from(neighbour)
              .where(
                and(
                  isNotNull(contentPublications.batchId),
                  eq(neighbour.batchId, contentPublications.batchId),
                  inArray(neighbour.state, ["queued", "publishing"]),
                ),
              ),
          ),
        ),
      )
      .orderBy(asc(contentPublications.updatedAt), asc(contentPublications.id))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!first) return null;
    const rest = first.batchId
      ? await tx
          .select()
          .from(contentPublications)
          .where(
            and(
              waiting,
              eq(contentPublications.batchId, first.batchId),
              ne(contentPublications.id, first.id),
            ),
          )
          .orderBy(asc(contentPublications.updatedAt), asc(contentPublications.id))
          .for("update", { skipLocked: true })
      : [];
    const group = [first, ...rest];
    await tx
      .update(contentPublications)
      .set({ nextAttemptAt: new Date(now.getTime() + HOOK_LEASE_MS) })
      .where(
        inArray(
          contentPublications.id,
          group.map((row) => row.id),
        ),
      );
    return group;
  });

type Step = "done" | "retry";
/**
 * Runs `step` up to HOOK_ATTEMPTS times. A thrown 4xx `apiError` is a refusal retrying cannot fix:
 * it is logged and ends the step as `skipped`. Anything else is logged and retried.
 */
const attempt = async <T>(
  name: string,
  slug: string,
  backoffMs: number,
  step: () => Promise<Readonly<{ status: Step; value: T }> | "skipped">,
  fallback: T,
): Promise<Readonly<{ status: "done" | "skipped" | "failed"; value: T }>> => {
  for (let n = 1; n <= HOOK_ATTEMPTS; n++) {
    try {
      const result = await step();
      if (result === "skipped") return { status: "skipped", value: fallback };
      if (result.status === "done") return { status: "done", value: result.value };
      logger.warn({ mod: "hooks", hook: name, slug, attempt: n }, "hook attempt failed");
    } catch (err) {
      if (isApiError(err) && err.status >= 400 && err.status < 500) {
        logger.warn(
          { mod: "hooks", hook: name, slug, code: err.code },
          "hook refused, not retried",
        );
        return { status: "skipped", value: fallback };
      }
      logger.error({ mod: "hooks", hook: name, slug, attempt: n, err }, "hook attempt threw");
    }
    if (n < HOOK_ATTEMPTS) await sleep(backoffMs * 2 ** (n - 1));
  }
  logger.error({ mod: "hooks", hook: name, slug, attempts: HOOK_ATTEMPTS }, "hook gave up");
  return { status: "failed", value: fallback };
};

const EN_DRAFT_CHANNELS: readonly SocialChannel[] = ["x_en", "li_en"];
const ALL_DRAFT_CHANNELS: readonly SocialChannel[] = ["x_en", "li_en", "tg_ru"];

const runForSlug = async (
  slug: string,
  members: readonly Readonly<{ job: Publication; lang: string }>[],
  backoffMs: number,
): Promise<SlugHooksReport> => {
  const publishes = members.some(({ job }) => job.kind === "publish");
  const { value: indexNow } = await attempt<IndexNowOutcome>(
    "indexnow",
    slug,
    backoffMs,
    async () => {
      // An EN member means the EN URL changed (live now, or just removed): ping the pair.
      const withEn = members.some(({ lang }) => lang === "en") || (await hasEnTwin(slug));
      const outcome = await pingIndexNow("posts", slug, withEn);
      return { status: outcome === "failed" ? "retry" : "done", value: outcome };
    },
    "failed",
  );

  if (!publishes) {
    const channels = members.some(({ job, lang }) => job.kind === "unpublish" && lang === "ru")
      ? ALL_DRAFT_CHANNELS
      : EN_DRAFT_CHANNELS;
    await attempt(
      "supersede-drafts",
      slug,
      backoffMs,
      async () => {
        await supersedeDrafts(slug, channels);
        return { status: "done", value: null };
      },
      null,
    );
    return { slug, indexNow, social: "none" };
  }
  if (!isSocialEnabled()) return { slug, indexNow, social: "none" };
  const social = await attempt(
    "social-kickoff",
    slug,
    backoffMs,
    async () => {
      const result = await kickoffSocial({ slug, actor: { userId: null } });
      // Flag off or env invalid: kickoff already logged why; retrying changes nothing.
      return result.ok ? { status: "done", value: null } : "skipped";
    },
    null,
  );
  return { slug, indexNow, social: social.status };
};

/** Runs the hooks of the oldest waiting publication (or batch). Null when none is waiting. */
export const runPublicationHooks = async (
  opts: Readonly<{ backoffMs?: number }> = {},
): Promise<HooksReport | null> => {
  const backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  const group = await claim();
  if (!group) return null;
  const ids = group.map((job) => job.id);
  const slugs: SlugHooksReport[] = [];
  try {
    const articles = await db
      .select({ id: contentArticles.id, slug: contentArticles.slug, lang: contentArticles.lang })
      .from(contentArticles)
      .where(
        inArray(
          contentArticles.id,
          group.map((job) => job.articleId),
        ),
      );
    const bySlug = new Map<string, { job: Publication; lang: string }[]>();
    for (const job of group) {
      const article = articles.find((row) => row.id === job.articleId);
      if (!article) {
        logger.warn(
          { mod: "hooks", publicationId: job.id, articleId: job.articleId },
          "publication has no article row, hooks skipped",
        );
        continue;
      }
      bySlug.set(article.slug, [...(bySlug.get(article.slug) ?? []), { job, lang: article.lang }]);
    }
    for (const [slug, members] of bySlug) slugs.push(await runForSlug(slug, members, backoffMs));
  } catch (err) {
    // Never fail the publication over a hook; the rest of the group is still marked done.
    logger.error({ mod: "hooks", publicationIds: ids, err }, "hooks crashed");
  }
  await db
    .update(contentPublications)
    .set({ hooksDoneAt: new Date() })
    .where(and(inArray(contentPublications.id, ids), isNull(contentPublications.hooksDoneAt)));
  return { publicationIds: ids, slugs };
};
