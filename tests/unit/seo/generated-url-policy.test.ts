import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { APIContext } from "astro";
import { GET as getLlmsFull } from "../../../src/pages/llms-full.txt";
import { GET as getLlmsTxt } from "../../../src/pages/llms.txt";
import { buildLegacyRedirects } from "~/lib/seo/redirects";
import { canonicalPath, isFileLikePath } from "~/lib/seo/url-policy";

interface Violation {
  readonly file: string;
  readonly href: string;
  readonly resolved: string;
}

const ROOT = process.cwd();
const DIST = join(ROOT, "dist", "client");
const ORIGIN = "https://artka.dev";

const filesUnder = (directory: string, extension: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path, extension);
    return entry.name.endsWith(extension) ? [path] : [];
  });

const decodeHtml = (value: string): string => value.replaceAll("&amp;", "&");

const attribute = (tag: string, name: string): string | undefined =>
  tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"))?.[1];

type UrlRole = "content" | "identity";

const addViolation = (
  violations: Violation[],
  file: string,
  href: string,
  resolved: string,
): void => {
  const violation = { file: relative(ROOT, file), href, resolved };
  if (
    !violations.some(
      (item) =>
        item.file === violation.file &&
        item.href === violation.href &&
        item.resolved === violation.resolved,
    )
  ) {
    violations.push(violation);
  }
};

const auditUrl = (
  violations: Violation[],
  file: string,
  rawHref: string,
  base: string,
  role: UrlRole,
): void => {
  const href = decodeHtml(rawHref);
  if (
    href === "" ||
    /^(?:mailto|tel):/i.test(href) ||
    (role === "content" && (href.startsWith("#") || href.startsWith("?") || href.startsWith("//")))
  ) {
    return;
  }

  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    if (role === "identity") addViolation(violations, file, href, ORIGIN);
    return;
  }

  if (role === "content" && url.hostname !== "artka.dev" && url.hostname !== "www.artka.dev") {
    return;
  }

  const expected = `${ORIGIN}${canonicalPath(url.pathname)}${url.hash}`;
  const hasCanonicalOrigin = url.origin === ORIGIN;
  const hasCanonicalPath = url.pathname === canonicalPath(url.pathname);
  const hasCanonicalDocumentPath = isFileLikePath(url.pathname) || hasCanonicalPath;
  const hasNoIdentityQuery = role === "content" || url.search === "";
  const hasAbsoluteForm = role === "content" || /^https:\/\/artka\.dev(?:\/|$)/.test(href);
  if (!hasCanonicalOrigin || !hasCanonicalDocumentPath || !hasNoIdentityQuery || !hasAbsoluteForm) {
    addViolation(violations, file, href, expected);
  }
};

const JSON_IDENTITY_KEYS = new Set(["@id", "url", "mainEntityOfPage", "isPartOf", "item"]);
// Public media can live on a CDN. These URLs are not document identities.
const JSON_MEDIA_KEYS = new Set(["image", "contentUrl", "thumbnailUrl"]);

const collectJsonIdentityUrls = (value: unknown, urls: string[]): void => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonIdentityUrls(item, urls));
    return;
  }
  if (value && typeof value === "object") {
    if ((value as Record<string, unknown>)["@type"] === "ImageObject") return;
    Object.entries(value).forEach(([key, item]) => {
      if (JSON_MEDIA_KEYS.has(key)) return;
      if (JSON_IDENTITY_KEYS.has(key) && typeof item === "string") {
        urls.push(item);
        return;
      }
      collectJsonIdentityUrls(item, urls);
    });
  }
};

const auditHtml = (violations: Violation[], file: string): void => {
  const html = readFileSync(file, "utf8");
  const linkTags = [...html.matchAll(/<link\b[^>]*>/gi)].map(([tag]) => tag);
  const canonicalTag = linkTags.find((tag) => attribute(tag, "rel") === "canonical");
  const canonical = canonicalTag ? attribute(canonicalTag, "href") : undefined;
  if (!canonical) throw new Error(`Missing canonical in ${relative(ROOT, file)}`);

  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = attribute(match[0], "href");
    if (href) auditUrl(violations, file, href, canonical, "content");
  }

  for (const tag of linkTags) {
    const rel = attribute(tag, "rel");
    if (rel !== "canonical" && !(rel === "alternate" && attribute(tag, "hreflang"))) continue;
    const href = attribute(tag, "href");
    if (href) auditUrl(violations, file, href, canonical, "identity");
  }

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (attribute(match[0], "property") !== "og:url") continue;
    const content = attribute(match[0], "content");
    if (content) auditUrl(violations, file, content, canonical, "identity");
  }

  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    const urls: string[] = [];
    collectJsonIdentityUrls(JSON.parse(match[1] ?? "null"), urls);
    urls.forEach((url) => auditUrl(violations, file, url, canonical, "identity"));
  }
};

const auditXmlArtifact = (violations: Violation[], file: string): void => {
  const contents = readFileSync(file, "utf8");
  for (const match of contents.matchAll(/<(?:loc|link|guid)(?:\s[^>]*)?>([^<]+)<\//gi)) {
    auditUrl(violations, file, match[1] ?? "", ORIGIN, "identity");
  }
  for (const match of contents.matchAll(/<(?:atom:link|xhtml:link)\b[^>]*>/gi)) {
    const href = attribute(match[0], "href");
    if (href) auditUrl(violations, file, href, ORIGIN, "identity");
  }
  for (const match of contents.matchAll(/href=&quot;([^&]+)&quot;/gi)) {
    auditUrl(violations, file, match[1] ?? "", ORIGIN, "content");
  }
};

const auditJsonFeed = (violations: Violation[], file: string): void => {
  const feed = JSON.parse(readFileSync(file, "utf8")) as {
    home_page_url: string;
    feed_url: string;
    items: ReadonlyArray<{
      id: string;
      url: string;
      content_html?: string;
    }>;
  };
  const absoluteUrls = [
    feed.home_page_url,
    feed.feed_url,
    ...feed.items.flatMap((item) => [item.id, item.url]),
  ];
  absoluteUrls.forEach((url) => auditUrl(violations, file, url, ORIGIN, "identity"));
  feed.items.forEach((item) => {
    for (const match of (item.content_html ?? "").matchAll(/<a\b[^>]*>/gi)) {
      const href = attribute(match[0], "href");
      if (href) auditUrl(violations, file, href, item.url, "content");
    }
  });
};

/**
 * RFC 6570 URI templates (a schema.org SearchAction urlTemplate quoted in a
 * post body, for example) are not document URLs: they cannot be fetched and
 * have no canonical identity, so the text audit leaves them alone.
 */
const isUriTemplate = (url: string): boolean => /\{[^}]*\}/.test(url);

const auditText = (violations: Violation[], file: string, contents: string): void => {
  const urls = contents.match(/https?:\/\/(?:www\.)?artka\.dev[^\s<"'\\)\],]*/g) ?? [];
  urls
    .filter((url) => !isUriTemplate(url))
    .forEach((url) => auditUrl(violations, file, url, ORIGIN, "identity"));
};

it.each([
  ["http://artka.dev/blog/", "https://artka.dev/blog/"],
  ["https://www.artka.dev/blog/", "https://artka.dev/blog/"],
  ["https://preview.example/blog/", "https://artka.dev/blog/"],
  ["/blog/", "https://artka.dev/blog/"],
  ["https://artka.dev/blog/?preview=1", "https://artka.dev/blog/"],
  ["https://artka.dev/rss.xml?preview=1", "https://artka.dev/rss.xml"],
  ["https://www.artka.dev/rss.xml", "https://artka.dev/rss.xml"],
  ["https://artka.dev/rss.xml/", "https://artka.dev/rss.xml"],
])("rejects non-canonical identity fixture %s", (href, resolved) => {
  const violations: Violation[] = [];
  const fixture = join(ROOT, "tests/fixtures/generated-url-policy.html");

  auditUrl(violations, fixture, href, ORIGIN, "identity");

  expect(violations).toEqual([
    {
      file: "tests/fixtures/generated-url-policy.html",
      href,
      resolved,
    },
  ]);
});

it("allows an ordinary external content link while enforcing a valid file identity", () => {
  const violations: Violation[] = [];
  const fixture = join(ROOT, "tests/fixtures/generated-url-policy.html");

  auditUrl(violations, fixture, "https://example.com/reference?x=1", ORIGIN, "content");
  auditUrl(violations, fixture, "https://artka.dev/rss.xml", ORIGIN, "identity");

  expect(violations).toEqual([]);
});

it("allows CDN media in JSON-LD while retaining document identity checks", () => {
  const urls: string[] = [];
  const externalPage = "https://preview.example/blog/example/";
  collectJsonIdentityUrls(
    {
      "@graph": [
        {
          "@type": "BlogPosting",
          "@id": externalPage,
          url: externalPage,
          image: { "@type": "ImageObject", url: "https://media.tgapps.cloud/articles/cover.webp" },
          thumbnailUrl: "https://media.tgapps.cloud/articles/thumb.webp",
        },
        {
          "@type": "ImageObject",
          "@id": "https://media.tgapps.cloud/articles/cover.webp",
          contentUrl: "https://media.tgapps.cloud/articles/cover.webp",
        },
      ],
    },
    urls,
  );
  expect(urls).toEqual([externalPage, externalPage]);
  const violations: Violation[] = [];
  urls.forEach((url) => auditUrl(violations, "fixture.html", url, ORIGIN, "identity"));
  expect(violations).toHaveLength(1);
  expect(violations[0]?.href).toBe(externalPage);
});

it("resolves every generated RU and EN lesson link to a built course route", () => {
  const lessonFiles = filesUnder(DIST, ".html").filter((file) =>
    /(?:^|\/)courses\/claude-code-guide\/[^/]+\/index\.html$/.test(file),
  );
  const redirects = buildLegacyRedirects();
  const violations: Violation[] = [];
  let checkedLinks = 0;

  expect(lessonFiles).toHaveLength(28);
  for (const file of lessonFiles) {
    const html = readFileSync(file, "utf8");
    const canonical = html.match(
      /<link\b(?=[^>]*\brel=["']canonical["'])[^>]*\bhref=["']([^"']+)/i,
    )?.[1];
    if (!canonical) throw new Error("Missing lesson canonical in " + relative(ROOT, file));

    for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
      const href = attribute(match[0], "href");
      if (!href || href.startsWith("#") || /^(?:mailto|tel):/i.test(href)) continue;
      const resolved = new URL(decodeHtml(href), canonical);
      if (
        resolved.origin !== ORIGIN ||
        !resolved.pathname.includes("/courses/claude-code-guide/")
      ) {
        continue;
      }

      checkedLinks += 1;
      const sourcePath = canonicalPath(resolved.pathname);
      const finalPath = redirects[sourcePath] ?? sourcePath;
      const generatedFile = join(DIST, finalPath.slice(1), "index.html");
      if (!existsSync(generatedFile)) {
        addViolation(violations, file, href, ORIGIN + finalPath);
      }
    }
  }

  expect(checkedLinks).toBeGreaterThan(100);
  expect(violations).toEqual([]);
});

it("skips RFC 6570 URI templates in text artifacts but still audits plain URLs", () => {
  const violations: Violation[] = [];

  auditText(
    violations,
    "llms-full.txt",
    '"target": "https://artka.dev/search/?q={search_term_string}" and https://artka.dev/search?q=x',
  );

  expect(violations).toEqual([
    {
      file: "llms-full.txt",
      href: "https://artka.dev/search?q=x",
      resolved: "https://artka.dev/search/",
    },
  ]);
});

it("emits one apex HTTPS slash identity for every internal document URL", async () => {
  const violations: Violation[] = [];

  filesUnder(DIST, ".html").forEach((file) => auditHtml(violations, file));
  [
    "sitemap-index.xml",
    "sitemap-ru.xml",
    "sitemap-en.xml",
    "rss.xml",
    "en/rss.xml",
    "courses/claude-code-guide/rss.xml",
    "en/courses/claude-code-guide/rss.xml",
  ].forEach((file) => auditXmlArtifact(violations, join(DIST, file)));
  ["feed.json", "en/feed.json"].forEach((file) => auditJsonFeed(violations, join(DIST, file)));
  // llms.txt and llms-full.txt are generated at request time (no dist file).
  auditText(violations, "llms.txt", await (await getLlmsTxt({} as APIContext)).text());
  auditText(violations, "llms-full.txt", await (await getLlmsFull({} as APIContext)).text());

  expect(violations).toEqual([]);
});
