import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { exportSchema, type ExportArticle, type ExportSnapshot } from "../content-api/contract";

/** The snapshot a build reads when CONTENT_SNAPSHOT is not set. */
export const FIXTURE_SNAPSHOT = "tests/fixtures/content-snapshot.json";
export const MANIFEST_FILE = "content-manifest.json";

export const contentManifestSchema = z.strictObject({ minArticles: z.number().int().positive() });

export const resolveSnapshotPath = (
  env: Readonly<Record<string, string | undefined>>,
  root: string,
): string => {
  // An unset CI expression arrives as "": that is a mistake, not a request for the fixture.
  if (env.CONTENT_SNAPSHOT === "") throw new Error("CONTENT_SNAPSHOT is set but empty");
  return resolve(root, env.CONTENT_SNAPSHOT ?? FIXTURE_SNAPSHOT);
};

/** Collection entry id: RU is bare, EN carries the `en/` prefix (the routing relies on it). */
export const entryIdOf = (article: Pick<ExportArticle, "slug" | "lang">): string =>
  article.lang === "en" ? `en/${article.slug}` : article.slug;

export const readJson = async (path: string): Promise<unknown> => {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    throw new Error(`cannot read ${path}: ${error instanceof Error ? error.message : error}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${error instanceof Error ? error.message : error}`);
  }
};

export const readManifest = async (
  root: string,
): Promise<z.infer<typeof contentManifestSchema>> => {
  const path = resolve(root, MANIFEST_FILE);
  const parsed = contentManifestSchema.safeParse(await readJson(path));
  if (!parsed.success) throw new Error(`${path} is invalid: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
};

/**
 * The gate between a snapshot file and the build. `minArticles` is a manual, catastrophic floor
 * (content-manifest.json): it catches a truncated or wrong export, not a normal unpublish. Lower
 * it by hand, in a commit, only for a deliberate mass removal; nothing raises it automatically.
 */
export const checkSnapshot = (
  raw: unknown,
  minArticles: number,
  source: string,
): ExportSnapshot => {
  const parsed = exportSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error(`${source} is not a valid content snapshot: ${z.prettifyError(parsed.error)}`);
  const snapshot = parsed.data;
  if (snapshot.count === 0) throw new Error(`${source} is an empty snapshot (count 0)`);
  if (snapshot.count < minArticles)
    throw new Error(
      `${source} has ${snapshot.count} articles, below the floor of ${minArticles} in ${MANIFEST_FILE}. ` +
        `The floor is a manual catastrophic floor: lower it by hand only for a deliberate mass removal.`,
    );
  const ids = new Set<string>();
  for (const article of snapshot.articles) {
    const sha = createHash("sha256").update(article.content, "utf8").digest("hex");
    if (sha !== article.contentSha256)
      throw new Error(
        `${source}: content of ${article.slug} (${article.lang}) does not match its sha256`,
      );
    const id = entryIdOf(article);
    if (ids.has(id))
      throw new Error(`${source}: duplicate article ${article.slug} (${article.lang})`);
    ids.add(id);
  }
  return snapshot;
};
