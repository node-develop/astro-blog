import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { config as dotenv } from "dotenv";
import { checkSnapshot, readManifest } from "../src/lib/content/snapshot";
import { CANONICAL_ORIGIN } from "../src/lib/seo/url-policy";

/**
 * Pulls GET /api/v1/export/ into a local snapshot file (default .content/snapshot.json) that a
 * build reads through CONTENT_SNAPSHOT. The same checks as the loader run before anything is
 * written, so a bad export never replaces a good file.
 */
dotenv();

const DEFAULT_TARGET = ".content/snapshot.json";

const main = async (): Promise<void> => {
  const token = process.env.CONTENT_EXPORT_TOKEN;
  if (!token) throw new Error("CONTENT_EXPORT_TOKEN is not set (scope content:export)");
  const origin = process.env.SITE_URL || CANONICAL_ORIGIN;
  const url = new URL("/api/v1/export/", origin);
  const target = resolve(process.argv[2] ?? DEFAULT_TARGET);

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(60_000),
  }).catch((error: unknown) => {
    const cause = error instanceof Error && error.cause ? ` (${String(error.cause)})` : "";
    throw new Error(`GET ${url} failed: ${error instanceof Error ? error.message : error}${cause}`);
  });
  if (!response.ok) {
    const excerpt = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`GET ${url} answered ${response.status}: ${excerpt}`);
  }
  const raw: unknown = await response.json();
  const { minArticles } = await readManifest(process.cwd());
  const snapshot = checkSnapshot(raw, minArticles, String(url));

  await mkdir(dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}`;
  try {
    await writeFile(tmp, JSON.stringify(snapshot, null, 2) + "\n");
    await rename(tmp, target);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
  process.stdout.write(
    `snapshotId ${snapshot.snapshotId}, ${snapshot.count} articles from ${url} -> ${target}\n`,
  );
};

main().catch((error: unknown) => {
  process.stderr.write(`content:pull failed: ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
