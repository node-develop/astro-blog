import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import type { Loader, LoaderContext } from "astro/loaders";
import { logger } from "../logger";
import type { ExportArticle, ExportSnapshot } from "../content-api/contract";
import { checkSnapshot, entryIdOf, readJson, readManifest, resolveSnapshotPath } from "./snapshot";

/** Bump when the shape of `data` built here changes: the digest must not match old store entries. */
export const DIGEST_VERSION = 1;

export type EntrySource = Readonly<{
  id: string;
  data: Record<string, unknown>;
  body: string;
  /** The whole article with its YAML header: `renderMarkdown` has no frontmatter option. */
  document: string;
}>;

/**
 * Same parser as the glob loader, so `body` is what glob would store: no YAML header (RSS,
 * feeds, reading time and `articleBody` read it). The header and the snapshot must agree on
 * what the article is, otherwise the page would carry one revision and the manifest another.
 */
export const toEntrySource = (article: ExportArticle): EntrySource => {
  const where = `${article.slug} (${article.lang})`;
  let parsed: ReturnType<typeof parseFrontmatter>;
  try {
    parsed = parseFrontmatter(article.content);
  } catch (error) {
    throw new Error(
      `${where}: cannot parse frontmatter: ${error instanceof Error ? error.message : error}`,
    );
  }
  if (parsed.frontmatter.lang !== article.lang)
    throw new Error(`${where}: frontmatter lang is ${String(parsed.frontmatter.lang)}`);
  if (parsed.frontmatter.apiRevision !== article.revision)
    throw new Error(
      `${where}: frontmatter apiRevision ${String(parsed.frontmatter.apiRevision)} is not the exported revision ${article.revision}`,
    );
  return {
    id: entryIdOf(article),
    data: { ...parsed.frontmatter, _meta: article.meta },
    body: parsed.content.trim(),
    document: article.content,
  };
};

type SyncContext = Pick<LoaderContext, "store" | "parseData" | "renderMarkdown" | "generateDigest">;

export const syncSnapshot = async (
  ctx: SyncContext,
  snapshot: ExportSnapshot,
): Promise<Readonly<{ rendered: number; skipped: number; deleted: number }>> => {
  let rendered = 0;
  let skipped = 0;
  const seen = new Set<string>();
  for (const article of snapshot.articles) {
    const { id, data, body, document } = toEntrySource(article);
    seen.add(id);
    const digest = ctx.generateDigest({
      v: DIGEST_VERSION,
      sha: article.contentSha256,
      meta: article.meta,
    });
    const existing = ctx.store.get(id);
    if (existing?.digest === digest && existing.rendered) {
      skipped += 1;
      continue;
    }
    const parsed = await ctx.parseData({ id, data });
    const html = await ctx.renderMarkdown(document);
    // Astro's `set` stores nothing and returns false on an equal digest, so an entry that has
    // the digest but no render must be dropped first, or the new render is thrown away.
    if (existing) ctx.store.delete(id);
    if (!ctx.store.set({ id, data: parsed, body, rendered: html, digest }))
      throw new Error(`${id}: the data store refused the entry`);
    rendered += 1;
  }
  let deleted = 0;
  for (const id of ctx.store.keys()) {
    if (seen.has(id)) continue;
    ctx.store.delete(id);
    deleted += 1;
  }
  return { rendered, skipped, deleted };
};

export const articlesLoader = (): Loader => ({
  name: "articles-loader",
  load: async (ctx) => {
    const root = fileURLToPath(ctx.config.root);
    // Read here, not at import: Astro does not load .env before the content sync, so
    // CONTENT_SNAPSHOT only reaches this process from the shell.
    const path = resolveSnapshotPath(process.env, root);
    const run = async (): Promise<void> => {
      const { minArticles } = await readManifest(root);
      const snapshot = checkSnapshot(await readJson(path), minArticles, path);
      const report = await syncSnapshot(ctx, snapshot);
      logger.info(
        { path, snapshotId: snapshot.snapshotId, count: snapshot.count, ...report },
        "content snapshot loaded",
      );
    };
    await run();
    ctx.watcher?.add(path);
    // One reload at a time: two quick change events must not write the same store concurrently.
    let queue: Promise<void> = Promise.resolve();
    ctx.watcher?.on("change", (changed) => {
      if (changed !== path) return;
      queue = queue.then(run).catch((error: unknown) => {
        logger.error({ err: error, path }, "content snapshot reload failed");
      });
    });
  },
});
