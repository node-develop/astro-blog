import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  articleDocumentSchema,
  exportSchema,
  type ArticleDocument,
  type ExportArticle,
} from "../../src/lib/content-api/contract";
import { serializeArticle, type RenderAsset } from "../../src/lib/content-api/markdown";
import {
  snapshotIdOf,
  sortedManifest,
  uuidV8,
  type ManifestEntry,
} from "../../src/lib/content-api/snapshot-id";
import { FIXTURE_SNAPSHOT } from "../../src/lib/content/snapshot";
import { FIXTURE_ARTICLES, type FixtureArticle, type FixtureLang } from "./fixture-articles";

/**
 * Regenerates tests/fixtures/content-snapshot.json through the real `serializeArticle`, so the
 * fixture has the exact shape of a production export. Everything is derived from the table in
 * fixture-articles.ts: no clock, no randomness, the same input gives the same bytes.
 */
const GENERATED_AT = "2026-10-05T00:00:00.000Z";
const HOUR_MS = 3_600_000;
// Far behind any real order, so a local posts_meta row never reorders the fixture.
const FIXTURE_ORDER = 2_000_000_000;
const LANGS = ["ru", "en"] as const satisfies readonly FixtureLang[];

const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

const buildArticle = async (
  fixture: FixtureArticle,
  lang: FixtureLang,
): Promise<ExportArticle | undefined> => {
  const text = fixture.texts[lang];
  if (!text) return undefined;
  const assetId = uuidV8(`fixture:asset:${fixture.slug}`);
  const cover = fixture.cover;
  const seoTitle = fixture.seoTitle?.[lang];
  const document: ArticleDocument = articleDocumentSchema.parse({
    externalId: fixture.slug,
    lang,
    slug: fixture.slug,
    title: text.title,
    description: text.description,
    summary: text.summary,
    body: text.body,
    tags: fixture.tags,
    keywords: text.keywords,
    sources: text.sources,
    ...(cover ? { cover: { assetId, alt: cover.alt[lang] } } : {}),
    ...(seoTitle ? { seo: { title: seoTitle } } : {}),
    faq: text.faq ?? [],
    relatedSlugs: fixture.relatedSlugs ?? [],
    provenance: { agent: "fixture" },
  });
  const assets: readonly RenderAsset[] = cover
    ? [{ id: assetId, url: cover.url, width: cover.width, height: cover.height }]
    : [];
  const revision = uuidV8(`fixture:${fixture.slug}:${lang}`);
  const ruDate = Date.parse(`${fixture.day}T09:00:00.000Z`);
  const publishedAt = new Date(lang === "en" ? ruDate + HOUR_MS : ruDate);
  const content = await serializeArticle(document, assets, revision, publishedAt);
  return {
    slug: fixture.slug,
    lang,
    revision,
    content,
    contentSha256: sha256(content),
    meta: {
      order: FIXTURE_ORDER,
      pinned: false,
      hiddenFromList: fixture.hiddenFromList ?? false,
    },
  };
};

const main = async (): Promise<void> => {
  const built = await Promise.all(
    FIXTURE_ARTICLES.flatMap((fixture) => LANGS.map((lang) => buildArticle(fixture, lang))),
  );
  const articles = built.filter((article): article is ExportArticle => article !== undefined);
  const manifest: readonly ManifestEntry[] = articles.map(({ slug, lang, revision, meta }) => ({
    slug,
    lang,
    revision,
    ...meta,
  }));
  const byKey = new Map(articles.map((article) => [`${article.lang}/${article.slug}`, article]));
  const sorted = sortedManifest(manifest).map((entry) => byKey.get(`${entry.lang}/${entry.slug}`)!);
  const snapshot = exportSchema.parse({
    snapshotId: snapshotIdOf(manifest),
    generatedAt: GENERATED_AT,
    count: sorted.length,
    articles: sorted,
  });
  const path = resolve(process.cwd(), FIXTURE_SNAPSHOT);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`);
  process.stdout.write(
    `${FIXTURE_SNAPSHOT}: snapshotId ${snapshot.snapshotId}, count ${snapshot.count}\n`,
  );
};

await main();
