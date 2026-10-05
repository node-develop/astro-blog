import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import type { Database } from "../db";
import { contentArticles, contentPublications, postsMeta } from "../db/schema";
import { defaultMetaFor } from "../content/loader";
import { logger } from "../logger";
import type { ExportArticle } from "./contract";
import { langSchema } from "./contract";
import { apiError } from "./errors";
import { sortedManifest, type ManifestEntry } from "./snapshot-id";

export type ExportHeader = Readonly<{ snapshotId: string; generatedAt: string }>;

const BATCH = 20;
/**
 * One statement, so one MVCC snapshot: every article that has a build pointer, with the metadata
 * of its slug. No `content` here; it is immutable per publication and read later in batches.
 * A pointer at an `unpublish` row breaks the invariant and fails loudly (500). A slug without a
 * `posts_meta` row gets the defaults the site itself uses (visible, last), with a warning.
 */
export const exportManifest = async (database: Database): Promise<readonly ManifestEntry[]> => {
  const rows = await database
    .select({
      articleId: contentArticles.id,
      slug: contentArticles.slug,
      lang: contentArticles.lang,
      revision: contentPublications.id,
      kind: contentPublications.kind,
      metaSlug: postsMeta.slug,
      order: postsMeta.order,
      pinned: postsMeta.pinned,
      hiddenFromList: postsMeta.hiddenFromList,
    })
    .from(contentArticles)
    .innerJoin(contentPublications, eq(contentPublications.id, contentArticles.buildPublicationId))
    .leftJoin(postsMeta, eq(postsMeta.slug, contentArticles.slug));
  const broken = rows.filter((row) => row.kind !== "publish").map((row) => row.articleId);
  if (broken.length) {
    logger.error({ articleIds: broken }, "export: build pointer at an unpublish publication");
    throw apiError(
      500,
      "export_inconsistent",
      "Some articles point at an unpublish publication; the export would not be the desired state.",
      { articleIds: broken },
    );
  }
  const noMeta = rows.filter((row) => row.metaSlug === null).map((row) => row.slug);
  if (noMeta.length)
    logger.warn({ slugs: noMeta }, "export: posts_meta row missing, using defaults");
  return sortedManifest(
    rows.map((row) => {
      const meta = defaultMetaFor(row.slug);
      return {
        slug: row.slug,
        lang: langSchema.parse(row.lang),
        revision: row.revision,
        order: row.metaSlug === null ? meta.order : row.order!,
        pinned: row.metaSlug === null ? meta.pinned : row.pinned!,
        hiddenFromList: row.metaSlug === null ? meta.hiddenFromList : row.hiddenFromList!,
      };
    }),
  );
};

const articleOf = (entry: ManifestEntry, content: string): ExportArticle => ({
  slug: entry.slug,
  lang: entry.lang,
  revision: entry.revision,
  content,
  contentSha256: createHash("sha256").update(content, "utf8").digest("hex"),
  meta: { order: entry.order, pinned: entry.pinned, hiddenFromList: entry.hiddenFromList },
});

/**
 * The response body, written header first and then the articles in batches as the client reads
 * (backpressure through `pull`): at most `BATCH` contents are in memory. The manifest is already
 * fixed, so `count` is known before the first byte. A missing content row, which should be
 * impossible (rows are insert-only), errors the stream: the client gets truncated, invalid JSON
 * instead of a snapshot that silently lacks an article.
 */
export const exportStream = (
  database: Database,
  manifest: readonly ManifestEntry[],
  header: ExportHeader,
): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  let next = 0;
  let started = false;
  return new ReadableStream<Uint8Array>({
    pull: async (controller) => {
      try {
        let text = started
          ? ""
          : `{"snapshotId":${JSON.stringify(header.snapshotId)},"generatedAt":${JSON.stringify(header.generatedAt)},"count":${manifest.length},"articles":[`;
        const first = next;
        const batch = manifest.slice(next, next + BATCH);
        if (batch.length) {
          const rows = await database
            .select({ id: contentPublications.id, content: contentPublications.content })
            .from(contentPublications)
            .where(
              inArray(
                contentPublications.id,
                batch.map((e) => e.revision),
              ),
            );
          const byId = new Map(rows.map((row) => [row.id, row.content]));
          const parts = batch.map((entry) => {
            const content = byId.get(entry.revision);
            if (content === undefined) throw new Error(`publication ${entry.revision} is gone`);
            return JSON.stringify(articleOf(entry, content));
          });
          text += (first > 0 ? "," : "") + parts.join(",");
          next += batch.length;
        }
        started = true;
        const done = next >= manifest.length;
        if (done) text += "]}";
        controller.enqueue(encoder.encode(text));
        if (done) controller.close();
      } catch (error) {
        logger.error(
          {
            errorType: error instanceof Error ? error.name : "unknown",
            reason: error instanceof Error ? error.message : String(error),
            written: next,
          },
          "export stream failed",
        );
        controller.error(error);
      }
    },
  });
};
