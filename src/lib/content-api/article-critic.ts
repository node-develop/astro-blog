/**
 * Article critic (`POST /articles/{id}/review/`). Judgment-only call site recorded in CLAUDE.md:
 * read-only, notes `{severity: block | warn, quote, reason}`. Model and prompt live in
 * `./article-critic.config.ts`.
 *
 * Sequence (the model call holds no lock and no transaction, like translate-article.ts):
 *   1. `readReviewTarget`: no lock; the version must be the one the client read.
 *   2. `runArticleCritic`: the LLM, nothing held.
 *   3. `writeReview`: under the content lock (via `once`), re-checks the version and stores the
 *      notes on that version's history row.
 * Unlike the social critic, an error is never "no notes": a failed review is 502/504.
 */
import Anthropic, { APIConnectionTimeoutError } from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { contentArticleVersions } from "../db/schema";
import { logger } from "../logger";
import { hasBlockNote } from "../social/critic-notes";
import {
  ARTICLE_CRITIC_BODY_CHARS,
  ARTICLE_CRITIC_DEADLINE_MS,
  ARTICLE_CRITIC_MAX_TOKENS,
  ARTICLE_CRITIC_MODEL,
  ARTICLE_CRITIC_SYSTEM,
  ARTICLE_CRITIC_TOOL,
} from "./article-critic.config";
import {
  articleReviewNoteSchema,
  type ArticleDocument,
  type ArticleReviewNote,
  type StoredReview,
} from "./contract";
import { documentHash } from "./editorial-gates";
import { normalise } from "./editorial";
import { apiError, isApiError } from "./errors";
import { requireArticle, type Article, type MutationResult, type Tx } from "./service";

export { ARTICLE_CRITIC_DEADLINE_MS };

const outputSchema = z.object({ notes: z.array(articleReviewNoteSchema).max(50) });
const TOOL = {
  name: ARTICLE_CRITIC_TOOL,
  description: "Emit the list of editorial notes.",
  input_schema: {
    type: "object",
    properties: {
      notes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            severity: { type: "string", enum: ["block", "warn"] },
            quote: { type: "string" },
            reason: { type: "string" },
          },
          required: ["severity", "quote", "reason"],
        },
      },
    },
    required: ["notes"],
  },
} as const;

const fieldsText = (document: ArticleDocument): string =>
  [
    document.title,
    document.description,
    document.summary,
    document.body,
    ...document.faq.flatMap((f) => [f.question, f.answer]),
  ]
    .map(normalise)
    .join("\n");

/**
 * A block note whose quote is not in the article cannot be fixed by anyone: it is downgraded to a
 * warning (and logged), so it never forces an agent to publish with `force`.
 */
export const groundNotes = (
  notes: readonly ArticleReviewNote[],
  document: ArticleDocument,
): readonly ArticleReviewNote[] => {
  const haystack = fieldsText(document);
  return notes.map((note) => {
    if (note.severity !== "block") return note;
    const quote = normalise(note.quote).replace(/\s+/g, " ").trim();
    const found =
      quote.length > 0 &&
      (haystack.includes(quote) || haystack.replace(/\s+/g, " ").includes(quote));
    if (found) return note;
    logger.warn({ mod: "article-critic" }, "block note without a quote in the article: downgraded");
    return { ...note, severity: "warn" };
  });
};

export const runArticleCritic = async (
  deps: Readonly<{ apiKey: string; signal: AbortSignal }>,
  document: ArticleDocument,
): Promise<readonly ArticleReviewNote[]> => {
  const client = new Anthropic({ apiKey: deps.apiKey, maxRetries: 0 });
  const body = document.body.slice(0, ARTICLE_CRITIC_BODY_CHARS);
  try {
    const response = await client.messages.create(
      {
        model: ARTICLE_CRITIC_MODEL,
        max_tokens: ARTICLE_CRITIC_MAX_TOKENS,
        system: [
          { type: "text", text: ARTICLE_CRITIC_SYSTEM, cache_control: { type: "ephemeral" } },
        ],
        tools: [TOOL] as never,
        tool_choice: { type: "tool", name: ARTICLE_CRITIC_TOOL } as never,
        messages: [
          {
            role: "user",
            content: `<ARTICLE>
lang: ${document.lang}
title: ${document.title}
summary: ${document.summary}
sources: ${JSON.stringify(document.sources)}
${body.length < document.body.length ? "(the body below is an excerpt)\n" : ""}body:
${body}
</ARTICLE>

Annotate using ${ARTICLE_CRITIC_TOOL}.`,
          },
        ],
      },
      { signal: deps.signal },
    );
    const block = response.content.find((b: { type: string }) => b.type === "tool_use");
    const parsed = block ? outputSchema.safeParse((block as { input: unknown }).input) : undefined;
    if (!parsed?.success) {
      logger.error({ mod: "article-critic" }, "article critic returned no valid notes");
      throw apiError(
        502,
        "review_failed",
        "The critic returned an unusable answer; nothing was saved.",
      );
    }
    return groundNotes(parsed.data.notes, document);
  } catch (error) {
    if (isApiError(error)) throw error;
    if (deps.signal.aborted || error instanceof APIConnectionTimeoutError) {
      logger.warn({ mod: "article-critic", code: "review_timeout" }, "article review timed out");
      throw apiError(504, "review_timeout", "The review took too long; nothing was saved.");
    }
    logger.error(
      {
        mod: "article-critic",
        errorType: error instanceof Error ? error.name : "unknown",
        reason: String(error),
      },
      "article review failed",
    );
    throw apiError(502, "review_failed", "The review failed; nothing was saved.");
  }
};

const staleVersion = (current: number) =>
  apiError(409, "version_conflict", "Read the current article before reviewing it.", {
    version: current,
  });

export const reviewView = (article: Article, review: StoredReview) => ({
  articleId: article.id,
  version: article.version,
  model: review.model,
  reviewedAt: review.reviewedAt,
  notes: review.notes,
  blocked: hasBlockNote(review.notes),
});

/** Step 1, no lock. */
export const readReviewTarget = async (id: string, expectedVersion: number): Promise<Article> => {
  const article = await requireArticle(db, id);
  if (article.version !== expectedVersion) throw staleVersion(article.version);
  return article;
};

/** Step 3, under the lock. A moved version means the paid review is for content that is gone. */
export const writeReview = async (
  tx: Tx,
  planned: Article,
  notes: readonly ArticleReviewNote[],
): Promise<MutationResult> => {
  const article = await requireArticle(tx, planned.id);
  if (article.version !== planned.version) {
    logger.warn(
      { articleId: planned.id, code: "version_conflict", version: planned.version },
      "article review not saved",
    );
    throw staleVersion(article.version);
  }
  const review: StoredReview = {
    model: ARTICLE_CRITIC_MODEL,
    reviewedAt: new Date().toISOString(),
    documentHash: documentHash(article.document),
    notes,
  };
  const saved = await tx
    .update(contentArticleVersions)
    .set({ review })
    .where(
      and(
        eq(contentArticleVersions.articleId, article.id),
        eq(contentArticleVersions.version, article.version),
      ),
    )
    .returning({ version: contentArticleVersions.version });
  // History written before versioning may have gaps: a review that cannot be stored is not "saved".
  if (!saved.length)
    throw apiError(
      409,
      "version_history_missing",
      "The history row of this version does not exist, so the review cannot be stored. Save the article again.",
      { version: article.version },
    );
  return { status: 200, data: reviewView(article, review) };
};

export type ReviewDeps = Readonly<{
  apiKey: string;
  once: (operation: (tx: Tx) => Promise<MutationResult>) => Promise<MutationResult>;
  signal?: AbortSignal;
}>;

export const runReview = async (
  deps: ReviewDeps,
  id: string,
  input: Readonly<{ expectedVersion: number }>,
): Promise<MutationResult> => {
  const article = await readReviewTarget(id, input.expectedVersion);
  const notes = await runArticleCritic(
    { apiKey: deps.apiKey, signal: deps.signal ?? AbortSignal.timeout(ARTICLE_CRITIC_DEADLINE_MS) },
    article.document,
  );
  return deps.once((tx) => writeReview(tx, article, notes));
};
