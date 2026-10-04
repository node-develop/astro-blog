/**
 * One shared builder of a document that passes every editorial gate, so tests that publish
 * through the real path (create/PUT with mode=publish, POST /publish/, the worker) keep doing so
 * with the gates on. The cover is an asset row of 1600 px that the worker's HEAD probe can reach
 * through `withFixtureAssets`.
 */
import { contentAssets } from "~/lib/db/schema";
import type { Database } from "~/lib/db";
import type { ArticleInput } from "~/lib/content-api/contract";

export const FIXTURE_COVER_ID = "0a9f2f4e-5b1c-4f43-9d7e-0c6b1f1f7a11";
const FIXTURE_COVER_URL = "https://media.example.test/fixture-cover.webp";

export const isFixtureAsset = (url: string | URL): boolean =>
  String(url).startsWith("https://media.example.test/");

/** Inserts the fixture cover (idempotent per database state; call after the tables are truncated). */
export const insertCoverAsset = async (
  db: Database,
  keyId: string,
  options: Readonly<{ width?: number }> = {},
) => {
  await db
    .insert(contentAssets)
    .values({
      id: FIXTURE_COVER_ID,
      hash: `fixture-cover-${FIXTURE_COVER_ID}`,
      url: FIXTURE_COVER_URL,
      objectKey: "fixture-cover.webp",
      mimeType: "image/webp",
      width: options.width ?? 1600,
      height: 900,
      byteSize: 1000,
      keyId,
    })
    .onConflictDoNothing();
  return { id: FIXTURE_COVER_ID, url: FIXTURE_COVER_URL };
};

/** Wraps a fetch stub: a HEAD for a fixture asset answers image/webp, everything else is delegated. */
export const withFixtureAssets =
  (inner: (url: string | URL, init?: RequestInit) => Promise<Response>) =>
  async (url: string | URL, init?: RequestInit): Promise<Response> =>
    isFixtureAsset(url) && init?.method === "HEAD"
      ? new Response(null, { headers: { "content-type": "image/webp" } })
      : inner(url, init);

const FILLER = { ru: "слово", en: "word" } as const;
const SOURCES = [1, 2, 3].map((n) => ({
  url: `https://example.com/fixture-source-${n}`,
  title: `Source ${n}`,
}));

/**
 * 1250 words of prose, two internal links, three sources, a Mermaid diagram with accTitle and
 * accDescr, and the fixture cover. The default title is derived from the slug: titles are unique
 * among published articles, so a shared default would couple tests.
 */
export const compliantArticle = (
  options: Readonly<{ lang?: "ru" | "en"; slug: string; title?: string; lead?: string }>,
): ArticleInput & { lang: "ru" | "en" } => {
  const lang = options.lang ?? "ru";
  const filler = Array.from({ length: 1250 }, () => FILLER[lang]).join(" ");
  return {
    lang,
    slug: options.slug,
    title: options.title ?? `Fixture ${options.slug}`,
    description: `Fixture description of ${options.slug}, long enough for the search description.`,
    summary: `Fixture summary of ${options.slug}: a document that passes every editorial gate of the API.`,
    body: [
      `## Intro ${options.slug}`,
      "",
      options.lead ?? "Lead paragraph.",
      "",
      filler,
      "",
      "See [one](/blog/fixture-link-one/) and [two](/blog/fixture-link-two/).",
      "",
      "```mermaid",
      "flowchart LR",
      "  accTitle: Fixture diagram",
      "  accDescr: A to B",
      "  A --> B",
      "```",
    ].join("\n"),
    tags: ["ai"],
    keywords: [],
    sources: SOURCES,
    cover: { assetId: FIXTURE_COVER_ID, alt: "Cover" },
    faq: [],
    relatedSlugs: [],
    provenance: { agent: "integration" },
  };
};
