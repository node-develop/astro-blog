/**
 * RU → EN translation of an API article (`POST /articles/{id}/translate/`). Judgment-only call
 * site recorded in CLAUDE.md: the model, prompts, batching and length retries come from
 * `src/lib/translate/*`; this module only maps an article document onto them and back.
 *
 * Sequence (the model call takes tens of seconds, so it holds no lock):
 *   1. `readTranslationSource`: short transaction, no lock; checks and protections.
 *   2. `translateDocument`: the LLM, nothing held.
 *   3. `writeTranslation`: under the content lock (via `once`), re-checks that RU and EN did not
 *      move meanwhile, then writes a DRAFT through the normal create/update path.
 */
import { APIConnectionTimeoutError } from "@anthropic-ai/sdk";
import { or, eq } from "drizzle-orm";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { visit } from "unist-util-visit";
import { db } from "../db";
import { contentArticles } from "../db/schema";
import { logger } from "../logger";
import {
  TRANSLATION_MODEL,
  batchPlaceholders,
  isLengthViolation,
  translateProse,
  translateStrings,
} from "../translate/claude";
import { extractProse, reassemble } from "../translate/extract-prose";
import { POST_LIMITS } from "../content/limits";
import type { Limits } from "../translate/validate-lengths";
import type { Actor } from "./auth";
import {
  TEXT_LIMITS,
  articleDocumentSchema,
  type ArticleDocument,
  type TranslateArticleInput,
} from "./contract";
import { apiError, isApiError } from "./errors";
import { inspectMarkdown } from "./markdown";
import {
  articleView,
  createArticle,
  fileOwnsSlug,
  relatedIsPublished,
  requireArticle,
  requireIdle,
  updateArticle,
  type Article,
  type MutationResult,
  type Publication,
  type Tx,
} from "./service";

/** Whole-request budget for the model calls; past it the request fails with 504. */
export const TRANSLATION_DEADLINE_MS = 270_000;
/** Per HTTP request to the model; the SDK's own retries are off, our loops retry. */
const REQUEST_LIMITS = { timeoutMs: 120_000, maxRetries: 0 } as const;
/**
 * Batches run one after another and must fit the deadline. Assumption: a batch (about 3000 source
 * tokens in, 2-3k out) takes up to ~45 s and the strings call up to ~45 s, so
 * (270 - 45) / 45 = 5 batches. A longer article is refused before any request is paid for.
 */
export const MAX_TRANSLATION_BATCHES = 5;

export type TranslationPlan =
  | Readonly<{ kind: "upToDate"; en: Article; latest: Publication | null }>
  | Readonly<{ kind: "translate"; ru: Article; en: Article | null }>;

/** An EN article nobody translated from RU is a person's (or an agent's) work: protected. */
const isProtected = (en: Article): boolean => en.manuallyEdited || en.sourceVersion === null;

const findEnglish = async (tx: Tx, ru: Article): Promise<Article | null> => {
  const others = (
    await tx
      .select()
      .from(contentArticles)
      .where(or(eq(contentArticles.externalId, ru.externalId), eq(contentArticles.slug, ru.slug)))
  ).filter((a) => a.id !== ru.id);
  if (others.some((a) => a.lang !== "en" || a.externalId !== ru.externalId || a.slug !== ru.slug))
    throw apiError(
      409,
      "article_exists",
      "External ID or slug is used by another article; translations must share both.",
      { articleIds: others.map((a) => a.id) },
    );
  return others[0] ?? null;
};

/** Short transaction without the content lock: everything that can be refused before paying. */
export const readTranslationSource = (id: string, force: boolean): Promise<TranslationPlan> =>
  db.transaction(async (tx) => {
    const ru = await requireArticle(tx, id);
    if (ru.lang !== "ru")
      throw apiError(422, "translation_source_not_ru", "Only a Russian article can be translated.");
    const en = await findEnglish(tx, ru);
    if (!en) {
      if (fileOwnsSlug(ru.slug, "en"))
        throw apiError(409, "slug_conflict", "An existing site article owns this slug.");
      return { kind: "translate", ru, en: null };
    }
    if (isProtected(en) && !force)
      throw apiError(
        409,
        "translation_protected",
        "The English article was edited by hand; send force: true to overwrite it.",
        { articleId: en.id },
      );
    const latest = await requireIdle(tx, en.id);
    if (!force && en.sourceVersion === ru.version) return { kind: "upToDate", en, latest };
    return { kind: "translate", ru, en };
  });

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
/** Values that must reach the English body unchanged: block code (not mermaid), math, inline math. */
const frozenValues = (markdown: string) => {
  const blocks: string[] = [];
  const inline: string[] = [];
  visit(parser.parse(markdown), (node) => {
    const n = node as { type: string; value?: string; lang?: string | null };
    if (n.type === "code" && n.lang !== "mermaid") blocks.push(`code:${n.lang ?? ""}:${n.value}`);
    if (n.type === "math") blocks.push(`math:${n.value}`);
    if (n.type === "inlineMath") inline.push(n.value ?? "");
  });
  return { blocks, inline: inline.sort() };
};
const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const failed = (message: string, details?: unknown) =>
  apiError(502, "translation_failed", message, details);

/** The (key → text) strings of a document, named the way `collectStringFields` names them. */
const documentStrings = (ru: ArticleDocument): Record<string, string> => ({
  title: ru.title,
  description: ru.description,
  summary: ru.summary,
  ...(ru.seo?.title ? { seo_title: ru.seo.title } : {}),
  ...(ru.seo?.description ? { seo_description: ru.seo.description } : {}),
  ...Object.fromEntries(ru.keywords.map((k, i) => [`keywords_${i}`, k])),
  ...Object.fromEntries(
    ru.faq.flatMap((f, i) => [
      [`faq_q${i}`, f.question],
      [`faq_a${i}`, f.answer],
    ]),
  ),
  ...(ru.cover ? { cover_alt: ru.cover.alt } : {}),
  ...(ru.cover?.caption ? { cover_caption: ru.cover.caption } : {}),
  ...(ru.socialImage ? { social_alt: ru.socialImage.alt } : {}),
  ...(ru.socialImage?.caption ? { social_caption: ru.socialImage.caption } : {}),
});

const limitFor = (key: string): Limits[string] => {
  if (key === "title") return POST_LIMITS.title;
  if (key === "description") return POST_LIMITS.description;
  if (key === "summary") return POST_LIMITS.summary;
  if (key === "seo_title") return TEXT_LIMITS.seoTitle;
  if (key === "seo_description") return TEXT_LIMITS.seoDescription;
  if (key.startsWith("keywords_")) return TEXT_LIMITS.keyword;
  if (key.startsWith("faq_q")) return POST_LIMITS.faqQuestion;
  if (key.startsWith("faq_a")) return POST_LIMITS.faqAnswer;
  return TEXT_LIMITS.imageText;
};

const isTimeout = (error: unknown, signal: AbortSignal): boolean =>
  signal.aborted || error instanceof APIConnectionTimeoutError;

/**
 * Translates the RU document into an EN document (not yet checked against the database).
 * Everything that goes wrong here is a 502/504/422 of ours, never the client's 422: the RU source
 * was valid, so a bad result is the translator's fault and nothing is saved.
 */
export const translateDocument = async (
  apiKey: string,
  ru: ArticleDocument,
  signal: AbortSignal = AbortSignal.timeout(TRANSLATION_DEADLINE_MS),
  articleId?: string,
): Promise<ArticleDocument> => {
  const { placeholders, skeleton } = extractProse(ru.body, {
    rewriteInternalLink: () => undefined,
  });
  if (batchPlaceholders(placeholders).length > MAX_TRANSLATION_BATCHES)
    throw apiError(
      422,
      "article_too_long_to_translate",
      `The body needs more than ${MAX_TRANSLATION_BATCHES} translation requests; split the article.`,
    );
  const batchCount = batchPlaceholders(placeholders).length;
  const strings = documentStrings(ru);
  const keys = Object.keys(strings);
  try {
    const translated = await translateStrings({
      apiKey,
      sourceLocale: "ru",
      targetLocale: "en",
      strings,
      constraints: Object.fromEntries(keys.map((key) => [key, limitFor(key)])),
      onExhausted: "throw",
      signal,
      requestLimits: REQUEST_LIMITS,
    });
    const missing = keys.filter((key) => !translated[key]?.trim());
    if (missing.length) throw failed("The translator left some fields empty.", { fields: missing });
    const prose = await translateProse({
      apiKey,
      sourceLocale: "ru",
      targetLocale: "en",
      placeholders,
      signal,
      requestLimits: REQUEST_LIMITS,
    });
    const body = reassemble(skeleton, prose);
    if (/<!--T\d+-->/.test(body)) throw failed("The translated body kept untranslated markers.");
    const before = inspectMarkdown(ru.body).assetIds;
    // The same checks the write runs under the lock; here a failure is the translator's, not the client's.
    const after = (() => {
      try {
        return inspectMarkdown(body).assetIds;
      } catch (error) {
        if (!isApiError(error)) throw error;
        throw failed("The translated body is not valid article Markdown.", { cause: error.code });
      }
    })();
    if (before.length !== after.length || before.some((id) => !after.includes(id)))
      throw failed("The translated body changed the set of images.");
    const source = frozenValues(ru.body);
    const result = frozenValues(body);
    if (!sameList(source.blocks, result.blocks) || !sameList(source.inline, result.inline))
      throw failed(
        "The translation altered a code block or a formula (a block nested in a list or a quote is translated as prose).",
      );

    const t = (key: string): string => translated[key]!;
    const cover = ru.cover && {
      ...ru.cover,
      alt: t("cover_alt"),
      ...(ru.cover.caption ? { caption: t("cover_caption") } : {}),
    };
    const socialImage = ru.socialImage && {
      ...ru.socialImage,
      alt: t("social_alt"),
      ...(ru.socialImage.caption ? { caption: t("social_caption") } : {}),
    };
    const parsed = articleDocumentSchema.safeParse({
      externalId: ru.externalId,
      lang: "en",
      slug: ru.slug,
      title: t("title"),
      description: t("description"),
      summary: t("summary"),
      body,
      tags: ru.tags,
      keywords: ru.keywords.map((_, i) => t(`keywords_${i}`)),
      sources: ru.sources,
      ...(cover ? { cover } : {}),
      ...(socialImage ? { socialImage } : {}),
      ...(ru.seo
        ? {
            seo: {
              ...(ru.seo.title ? { title: t("seo_title") } : {}),
              ...(ru.seo.description ? { description: t("seo_description") } : {}),
            },
          }
        : {}),
      faq: ru.faq.map((_, i) => ({ question: t(`faq_q${i}`), answer: t(`faq_a${i}`) })),
      relatedSlugs: ru.relatedSlugs,
      provenance: { agent: ru.provenance.agent, model: TRANSLATION_MODEL },
    });
    if (!parsed.success)
      throw apiError(
        502,
        "translation_invalid",
        "The translation does not satisfy the article contract; nothing was saved.",
        {
          issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      );
    return parsed.data;
  } catch (error) {
    // Money was spent on every one of these and nothing is saved: leave a trace for cost review.
    const paid = (code: string) =>
      logger.warn({ articleId, code, batches: batchCount }, "article translation not saved");
    if (isApiError(error)) {
      if (error.code === "translation_failed" || error.code === "translation_invalid")
        paid(error.code);
      throw error;
    }
    if (isLengthViolation(error)) {
      paid("translation_invalid");
      throw apiError(
        502,
        "translation_invalid",
        "The translation breaks length limits after retries; nothing was saved.",
        { issues: error.violations.map((v) => ({ path: v.key, message: `${v.kind} ${v.got}` })) },
      );
    }
    if (isTimeout(error, signal)) {
      paid("translation_timeout");
      throw apiError(
        504,
        "translation_timeout",
        "The translation took too long; nothing was saved.",
      );
    }
    logger.error(
      {
        articleId,
        batches: batchCount,
        errorType: error instanceof Error ? error.name : "unknown",
        reason: String(error),
      },
      "article translation failed",
    );
    throw failed("The translation failed; nothing was saved.");
  }
};

/** Under the content lock. A moved RU version or a changed EN row means the paid result is stale. */
export const writeTranslation = async (
  tx: Tx,
  plan: Extract<TranslationPlan, { kind: "translate" }>,
  document: ArticleDocument,
  actor: Actor,
  agent: string,
): Promise<MutationResult> => {
  const ru = await requireArticle(tx, plan.ru.id);
  const en = await findEnglish(tx, ru);
  const moved =
    ru.version !== plan.ru.version ||
    (plan.en === null ? en !== null : en === null || en.version !== plan.en.version);
  if (moved) {
    logger.warn(
      { articleId: plan.ru.id, code: "version_conflict", sourceVersion: plan.ru.version },
      "article translation not saved",
    );
    throw apiError(
      409,
      "version_conflict",
      "The article changed while it was being translated; nothing was saved. Translate again.",
      { sourceVersion: plan.ru.version, currentVersion: ru.version },
    );
  }
  const kept: string[] = [];
  const warnings: string[] = [];
  for (const slug of document.relatedSlugs) {
    if (await relatedIsPublished(tx, slug, "en")) kept.push(slug);
    else warnings.push(`related_not_translated:${slug}`);
  }
  const english = { ...document, relatedSlugs: kept };
  const mark = { sourceVersion: ru.version };
  const result = en
    ? await updateArticle(
        tx,
        en.id,
        { article: english, mode: "draft", expectedVersion: en.version },
        actor,
        agent,
        mark,
      )
    : await createArticle(tx, english, "draft", actor, agent, mark);
  return {
    status: result.status,
    data: {
      ...result.data,
      translation: { sourceVersion: ru.version, stale: false },
      warnings: [...((result.data.warnings as string[] | undefined) ?? []), ...warnings],
    },
  };
};

export type TranslationDeps = Readonly<{
  apiKey: string;
  actor: Actor;
  agent: string;
  /** Runs the write under the content lock and stores the response for idempotent replay. */
  once: (operation: (tx: Tx) => Promise<MutationResult>) => Promise<MutationResult>;
  signal?: AbortSignal;
}>;

export const runTranslation = async (
  deps: TranslationDeps,
  id: string,
  input: TranslateArticleInput,
): Promise<MutationResult> => {
  const plan = await readTranslationSource(id, input.force);
  if (plan.kind === "upToDate")
    return {
      status: 200,
      data: {
        ...articleView(plan.en, plan.latest),
        translation: { sourceVersion: plan.en.sourceVersion, stale: false },
        unchanged: true,
        warnings: [],
      },
    };
  const document = await translateDocument(deps.apiKey, plan.ru.document, deps.signal, plan.ru.id);
  return deps.once((tx) => writeTranslation(tx, plan, document, deps.actor, deps.agent));
};
