import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExportArticle, ExportSnapshot } from "../content-api/contract";
import { verifyContentBuild } from "./verify-build";

const REVISIONS = {
  ok: "00000000-0000-4000-8000-000000000001",
  stale: "00000000-0000-4000-8000-000000000002",
  hidden: "00000000-0000-4000-8000-000000000003",
} as const;

const article = (slug: string, revision: string, hiddenFromList = false): ExportArticle => ({
  slug,
  lang: "ru",
  revision,
  content: "",
  contentSha256: "0".repeat(64),
  meta: { order: 1, pinned: false, hiddenFromList },
});

const snapshot: ExportSnapshot = {
  snapshotId: "00000000-0000-4000-8000-0000000000aa",
  generatedAt: "2026-10-05T00:00:00.000Z",
  count: 3,
  articles: [
    article("fresh", REVISIONS.ok),
    article("stale", REVISIONS.stale),
    article("hidden", REVISIONS.hidden, true),
  ],
};

let dist: string;
const page = async (slug: string, revision: string): Promise<void> => {
  await mkdir(join(dist, "blog", slug), { recursive: true });
  await writeFile(
    join(dist, "blog", slug, "index.html"),
    `<main data-content-revision="${revision}"></main>`,
  );
};
const sitemap = (...slugs: string[]): string =>
  `<urlset>${slugs.map((s) => `<url><loc>https://artka.dev/blog/${s}/</loc></url>`).join("")}</urlset>`;

beforeEach(async () => {
  dist = await mkdtemp(join(tmpdir(), "verify-build-"));
  await writeFile(join(dist, "sitemap-en.xml"), "<urlset></urlset>");
});
afterEach(() => rm(dist, { recursive: true, force: true }));

describe("verifyContentBuild", () => {
  it("passes a build that matches the snapshot", async () => {
    await page("fresh", REVISIONS.ok);
    await page("stale", REVISIONS.stale);
    await page("hidden", REVISIONS.hidden);
    await writeFile(join(dist, "sitemap-ru.xml"), sitemap("fresh", "stale"));
    expect(await verifyContentBuild(snapshot, dist)).toEqual([]);
  });

  it("reports a page with an old revision and a hidden article that is in the sitemap", async () => {
    await page("fresh", REVISIONS.ok);
    await page("stale", "00000000-0000-4000-8000-0000000000ff");
    await page("hidden", REVISIONS.hidden);
    await writeFile(join(dist, "sitemap-ru.xml"), sitemap("fresh", "stale", "hidden"));
    const issues = await verifyContentBuild(snapshot, dist);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain("stale (ru): page does not carry data-content-revision");
    expect(issues[1]).toContain("hidden (ru): hiddenFromList but present in sitemap-ru.xml");
  });
});
