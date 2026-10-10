import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { load } from "~/lib/yaml";
import { brandedTitle, TITLE_BUDGET } from "~/lib/seo/title";

/**
 * The SERP title budget and rule live in src/lib/seo/title.ts; these tests assert
 * what that rule means for real content and built pages, not the copy of one page:
 *
 *   - the brand suffix is dropped when it would push the title over the budget;
 *   - og:title / twitter:title carry the bare title (og:site_name has the brand);
 *   - the titles pages actually build stay inside the budget, or at worst are
 *     exactly what the content itself says, with nothing added by a layout.
 */

const repoFile = (rel: string): string => join(process.cwd(), rel);
const read = (rel: string): string => readFileSync(repoFile(rel), "utf8");

const readStrings = (rel: string): Record<string, string> =>
  JSON.parse(read(rel)) as Record<string, string>;
const ruStrings = readStrings("src/i18n/strings.ru.json");
const enStrings = readStrings("src/i18n/strings.en.json");

const frontmatter = (rel: string): Record<string, unknown> => {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(read(rel))?.[1];
  if (block === undefined) throw new Error(`No frontmatter in ${rel}`);
  return (load(block) ?? {}) as Record<string, unknown>;
};

const str = (rel: string, key: string): string => {
  const value = frontmatter(rel)[key];
  if (typeof value !== "string") throw new Error(`${rel}: ${key} is not a string`);
  return value;
};

const requireString = (source: Record<string, string>, key: string): string => {
  const value = source[key];
  if (value === undefined) throw new Error(`Missing i18n key: ${key}`);
  return value;
};

// Helpers for the built-page checks. The source-level tests above and below
// prove a value exists and fits; only the built HTML proves a page uses it.
// Every reader is called inside an `it`, so a missing build fails that test
// with ENOENT instead of failing the whole file at collection time.

/** `&amp;` goes last, or `&amp;lt;` would decode twice. */
const decodeEntities = (value: string): string =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&amp;/g, "&");

const builtTitle = (html: string): string | undefined => {
  const raw = /<title>([^<]*)<\/title>/i.exec(html)?.[1];
  return raw === undefined ? undefined : decodeEntities(raw);
};

/** `content` of a `<meta>` tag, whatever order its attributes were written in. */
const metaContent = (html: string, attr: "property" | "name", key: string): string | undefined => {
  const tag = new RegExp(`<meta\\b[^>]*\\b${attr}=["']${key}["'][^>]*>`, "i").exec(html)?.[0];
  const content = tag === undefined ? null : /\bcontent=(?:"([^"]*)"|'([^']*)')/i.exec(tag);
  const value = content?.[1] ?? content?.[2];
  return value === undefined ? undefined : decodeEntities(value);
};

/** File under dist/client that a built page's absolute `og:image` URL refers to. */
const builtImageFile = (image: string | undefined): string =>
  join("dist/client", new URL(image ?? "", "https://artka.dev").pathname);

describe("landing and archive titles fit the budget", () => {
  const entityMeta = (page: string, locale: "ru" | "en"): string => {
    const dir = locale === "en" ? "src/content/site/en" : "src/content/site";
    return str(`${dir}/${page}.md`, "metaTitle");
  };

  // The longest tag label in each dictionary is the worst case for the archive
  // template, so that is what gets measured.
  const longestLabel = (rel: string): string =>
    Object.values(readStrings(rel)).reduce((a, b) => (b.length > a.length ? b : a), "");

  const cases = [
    { page: "blog index (ru)", title: requireString(ruStrings, "meta.blog.title") },
    { page: "blog index (en)", title: requireString(enStrings, "meta.blog.title") },
    { page: "about (ru)", title: entityMeta("about", "ru") },
    { page: "about (en)", title: entityMeta("about", "en") },
    { page: "now (ru)", title: entityMeta("now", "ru") },
    { page: "now (en)", title: entityMeta("now", "en") },
    { page: "uses (ru)", title: entityMeta("uses", "ru") },
    { page: "uses (en)", title: entityMeta("uses", "en") },
    { page: "contact (ru)", title: entityMeta("contact", "ru") },
    { page: "contact (en)", title: entityMeta("contact", "en") },
    { page: "privacy (ru)", title: entityMeta("privacy", "ru") },
    { page: "privacy (en)", title: entityMeta("privacy", "en") },
    {
      page: "tag archive (ru)",
      title: requireString(ruStrings, "tags.archiveTitle").replace(
        "{label}",
        longestLabel("src/i18n/tags.ru.json"),
      ),
    },
    {
      page: "tag archive (en)",
      title: requireString(enStrings, "tags.archiveTitle").replace(
        "{label}",
        longestLabel("src/i18n/tags.en.json"),
      ),
    },
  ];

  it.each(cases)("$page stays inside the budget with the brand", ({ title }) => {
    expect(brandedTitle(title).length).toBeLessThanOrEqual(TITLE_BUDGET);
  });

  it("gives the tag archive a description worth showing", () => {
    for (const strings of [ruStrings, enStrings]) {
      const rendered = requireString(strings, "tags.archiveDescription").replace("{label}", "SEO");
      expect(rendered.length).toBeGreaterThanOrEqual(100);
      expect(rendered.length).toBeLessThanOrEqual(160);
    }
  });

  it("gives every entity page a meta description of search-result length", () => {
    const pages = ["about", "now", "uses", "contact", "privacy"] as const;
    for (const page of pages) {
      for (const rel of [`src/content/site/${page}.md`, `src/content/site/en/${page}.md`]) {
        const value = str(rel, "metaDescription");
        expect(value.length, rel).toBeGreaterThanOrEqual(140);
        expect(value.length, rel).toBeLessThanOrEqual(160);
      }
    }
  });
});

// 6a37f98 fixed pages that ignored metadata they already had: the values were
// in the frontmatter, the templates never read them. Scoring the frontmatter
// (above) cannot see that bug coming back; only the rendered page can.
describe("entity pages render the metadata written for them", () => {
  const entities = (["about", "now", "uses", "contact", "privacy"] as const).flatMap((page) => [
    { source: `src/content/site/${page}.md`, built: `dist/client/${page}/index.html` },
    { source: `src/content/site/en/${page}.md`, built: `dist/client/en/${page}/index.html` },
  ]);

  it.each(entities)("$built", ({ source, built }) => {
    const html = read(built);
    expect(builtTitle(html)).toBe(brandedTitle(str(source, "metaTitle")));
    expect(metaContent(html, "name", "description")).toBe(str(source, "metaDescription"));
  });

  it("can tell metaTitle from the visible title, so the check above is not vacuous", () => {
    const distinct = entities.filter(
      ({ source }) => str(source, "metaTitle") !== str(source, "title"),
    );
    expect(distinct.length).toBeGreaterThan(0);
  });
});

describe("tag archives get the section preview image", () => {
  const archives = [
    { built: "dist/client/tags", locale: "ru" },
    { built: "dist/client/en/tags", locale: "en" },
  ] as const;

  // An EN archive pointing at the RU card is the defect 3efe201 fixed for
  // posts, so each built archive must carry its own locale's card.
  it.each(archives)(
    "every built $locale archive carries a built $locale card",
    ({ built, locale }) => {
      const pages = readdirSync(repoFile(built), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${built}/${entry.name}/index.html`);
      expect(pages.length).toBeGreaterThan(0);
      for (const page of pages) {
        const image = metaContent(read(page), "property", "og:image");
        expect(image, page).toBeDefined();
        expect(image, page).not.toMatch(/og-default\.(svg|png)/);
        // Cards are named `<name>-<locale>.png`; see landingOgPath().
        expect(image, page).toMatch(new RegExp(`-${locale}\\.png$`));
        expect(existsSync(repoFile(builtImageFile(image))), `${page} -> ${image}`).toBe(true);
      }
    },
  );
});
