import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExportArticle } from "~/lib/content-api/contract";
import { verifyContentBuild } from "~/lib/content/verify-build";
import { canonicalUrl } from "~/lib/seo/url-policy";
import { bodyOf, DIST, frontmatterOf, labelOf, pageFileOf, underTest } from "../support/snapshot";

/**
 * The build must show what the snapshot asked for. The snapshot is resolved exactly as the loader
 * resolves it, so CONTENT_SNAPSHOT has to be the same for `pnpm build` and this run. Every check
 * is "for each article with X, the page does Y": nothing here depends on which articles exist.
 */
const { snapshot } = underTest;
const where = `snapshot ${underTest.path} (snapshotId ${snapshot.snapshotId})`;
const label = labelOf;

/** HTML of the post body, from the opening `.post__body` tag to the end of the page. */
const postBody = async (a: ExportArticle): Promise<string> => {
  const html = await readFile(pageFileOf(a), "utf8");
  const start = html.indexOf('class="post__body');
  if (start === -1) throw new Error(`no class="post__body" on the page of ${label(a)} in ${where}`);
  return html.slice(start);
};

/** Text with markup and entities removed, reduced to lowercase letters and digits (typography-proof). */
const plainText = (html: string): string =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

describe("build of the content snapshot", () => {
  it(`matches ${where}: pages, revisions and sitemaps`, async () => {
    expect(await verifyContentBuild(snapshot, DIST), where).toEqual([]);
  });

  it("renders block math as KaTeX for every article that has it", async () => {
    const failures: string[] = [];
    for (const a of snapshot.articles) {
      if (!bodyOf(a).includes("$$")) continue;
      const body = await postBody(a);
      if (!body.includes('class="katex"')) failures.push(label(a));
    }
    expect(failures, `no class="katex" in ${where}`).toEqual([]);
  });

  it("renders every mermaid block as a figure captioned in the article's language", async () => {
    const failures: string[] = [];
    for (const a of snapshot.articles) {
      const blocks = (bodyOf(a).match(/^```mermaid\s*$/gm) ?? []).length;
      if (blocks === 0) continue;
      const body = await postBody(a);
      const figures = body.match(/<figure\b[^>]*class="diagram"/g) ?? [];
      if (figures.length !== blocks)
        failures.push(`${label(a)}: ${blocks} mermaid blocks, ${figures.length} figures`);
      const word = a.lang === "en" ? "Figure" : "Схема";
      const numbers = [...body.matchAll(/<span class="diagram__num">([^<]*)<\/span>/g)].map(
        (m) => m[1] as string,
      );
      if (numbers.length !== figures.length)
        failures.push(
          `${label(a)}: ${figures.length} figures, ${numbers.length} diagram__num captions`,
        );
      if (!numbers.every((n) => n.startsWith(`${word} `)))
        failures.push(`${label(a)}: captions ${JSON.stringify(numbers)} do not start with ${word}`);
    }
    expect(failures, where).toEqual([]);
  });

  it("does not repeat the description as a quote in the body of an article that opens with it", async () => {
    const failures: string[] = [];
    for (const a of snapshot.articles) {
      const description = String(frontmatterOf(a).description ?? "");
      if (!description || !bodyOf(a).trimStart().startsWith(`> ${description}`)) continue;
      const body = await postBody(a);
      const quotes = [...body.matchAll(/<blockquote\b[\s\S]*?<\/blockquote>/g)].map((m) =>
        plainText(m[0]),
      );
      if (quotes.some((q) => q.includes(plainText(description)))) failures.push(label(a));
    }
    expect(failures, where).toEqual([]);
  });

  it("keeps every hiddenFromList article out of its locale's feed.json", async () => {
    const failures: string[] = [];
    for (const lang of ["ru", "en"] as const) {
      const feed = JSON.parse(
        await readFile(join(DIST, lang === "en" ? "en" : "", "feed.json"), "utf8"),
      ) as { items: ReadonlyArray<{ url: string }> };
      const urls = feed.items.map((item) => item.url);
      for (const a of snapshot.articles) {
        if (a.lang !== lang || !a.meta.hiddenFromList) continue;
        const expected = canonicalUrl(`${lang === "en" ? "/en" : ""}/blog/${a.slug}/`);
        if (urls.includes(expected)) failures.push(label(a));
      }
    }
    expect(failures, where).toEqual([]);
  });
});
