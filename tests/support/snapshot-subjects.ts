import { join } from "node:path";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import type { ExportArticle } from "~/lib/content-api/contract";

/**
 * Pure helpers over snapshot articles, with no file or env access: `tests/unit` can import them
 * (the fixture must contain a subject for every predicate) and so can `tests/built`, through
 * `./snapshot`.
 */
export const DIST = join(process.cwd(), "dist", "client");

export const routeOf = (a: Pick<ExportArticle, "slug" | "lang">): string =>
  `${a.lang === "en" ? "/en" : ""}/blog/${a.slug}/`;
export const pageFileOf = (a: Pick<ExportArticle, "slug" | "lang">): string =>
  join(DIST, a.lang === "en" ? "en" : "", "blog", a.slug, "index.html");
export const labelOf = (a: Pick<ExportArticle, "slug" | "lang">): string => `${a.slug} (${a.lang})`;
export const bodyOf = (a: ExportArticle): string => parseFrontmatter(a.content).content;
export const frontmatterOf = (a: ExportArticle): Readonly<Record<string, unknown>> =>
  parseFrontmatter(a.content).frontmatter;

/** Fenced blocks of a Markdown body, closing fences paired with their opening one. */
export const fencedBlocks = (
  body: string,
): ReadonlyArray<{ readonly lang: string; readonly text: string }> => {
  const blocks: { lang: string; text: string }[] = [];
  let open: { lang: string; lines: string[] } | null = null;
  for (const line of body.split("\n")) {
    const fence = /^```(\S*)\s*$/.exec(line);
    if (open === null) {
      if (/^```/.test(line)) open = { lang: fence?.[1] ?? "", lines: [] };
    } else if (fence !== null && fence[1] === "") {
      blocks.push({ lang: open.lang, text: open.lines.join("\n") });
      open = null;
    } else {
      open.lines.push(line);
    }
  }
  return blocks;
};

const codeBlocksOf = (a: ExportArticle) =>
  fencedBlocks(bodyOf(a)).filter((b) => b.lang !== "mermaid");

// Predicates that pick subjects out of the snapshot. Each one needs a subject in the fixture.
export const hasMermaid = (a: ExportArticle): boolean =>
  fencedBlocks(bodyOf(a)).some((b) => b.lang === "mermaid");
export const hasCode = (a: ExportArticle): boolean => codeBlocksOf(a).length > 0;
/** The first code block, which is the first `pre.astro-code` on the page, has an empty line. */
export const hasCopyableFirstBlock = (a: ExportArticle): boolean =>
  codeBlocksOf(a)[0]?.text.includes("\n\n") ?? false;
export const hasNoCover = (a: ExportArticle): boolean => frontmatterOf(a).cover === undefined;
/** A cover that is also the social image, with the size recorded for it. */
export const hasSizedCover = (a: ExportArticle): boolean => {
  const fm = frontmatterOf(a);
  return (
    typeof fm.cover === "string" &&
    fm.socialImage === fm.cover &&
    typeof fm.socialImageWidth === "number" &&
    typeof fm.socialImageHeight === "number"
  );
};
