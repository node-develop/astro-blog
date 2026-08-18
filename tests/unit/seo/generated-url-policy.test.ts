import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
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

const isSkipped = (href: string): boolean =>
  href === "" || href.startsWith("#") || href.startsWith("//") || /^(?:mailto|tel):/i.test(href);

const auditUrl = (
  violations: Violation[],
  file: string,
  rawHref: string,
  base: string,
  requireAbsolute: boolean,
): void => {
  const href = decodeHtml(rawHref);
  if (isSkipped(href)) return;

  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return;
  }

  if (url.hostname !== "artka.dev" && url.hostname !== "www.artka.dev") return;
  if (isFileLikePath(url.pathname)) return;

  const expected = `${ORIGIN}${canonicalPath(url.pathname)}${url.hash}`;
  const hasCanonicalOrigin = url.origin === ORIGIN;
  const hasCanonicalPath = url.pathname === canonicalPath(url.pathname);
  const hasNoQueryIdentity = url.search === "";
  const hasAbsoluteForm = !requireAbsolute || /^https:\/\/artka\.dev\//.test(href);
  if (!hasCanonicalOrigin || !hasCanonicalPath || !hasNoQueryIdentity || !hasAbsoluteForm) {
    const violation = { file: relative(ROOT, file), href, resolved: expected };
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
  }
};

const collectJsonUrls = (value: unknown, urls: string[]): void => {
  if (typeof value === "string") {
    if (value.startsWith("/") || /^https?:\/\//.test(value)) urls.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonUrls(item, urls));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectJsonUrls(item, urls));
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
    if (href) auditUrl(violations, file, href, canonical, false);
  }

  for (const tag of linkTags) {
    const rel = attribute(tag, "rel");
    if (rel !== "canonical" && rel !== "alternate") continue;
    const href = attribute(tag, "href");
    if (href) auditUrl(violations, file, href, canonical, true);
  }

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (attribute(match[0], "property") !== "og:url") continue;
    const content = attribute(match[0], "content");
    if (content) auditUrl(violations, file, content, canonical, true);
  }

  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    const urls: string[] = [];
    collectJsonUrls(JSON.parse(match[1] ?? "null"), urls);
    urls.forEach((url) => auditUrl(violations, file, url, canonical, true));
  }
};

const auditXmlArtifact = (violations: Violation[], file: string): void => {
  const contents = readFileSync(file, "utf8");
  for (const match of contents.matchAll(/<(?:loc|link|guid)(?:\s[^>]*)?>([^<]+)<\//gi)) {
    auditUrl(violations, file, match[1] ?? "", ORIGIN, true);
  }
  for (const match of contents.matchAll(/<(?:atom:link|xhtml:link)\b[^>]*>/gi)) {
    const href = attribute(match[0], "href");
    if (href) auditUrl(violations, file, href, ORIGIN, true);
  }
  for (const match of contents.matchAll(/href=&quot;([^&]+)&quot;/gi)) {
    auditUrl(violations, file, match[1] ?? "", ORIGIN, false);
  }
};

const auditJsonFeed = (violations: Violation[], file: string): void => {
  const feed = JSON.parse(readFileSync(file, "utf8")) as {
    home_page_url: string;
    feed_url: string;
    authors: ReadonlyArray<{ url: string; avatar?: string }>;
    items: ReadonlyArray<{
      id: string;
      url: string;
      authors: ReadonlyArray<{ url: string; avatar?: string }>;
      content_html?: string;
    }>;
  };
  const absoluteUrls = [
    feed.home_page_url,
    feed.feed_url,
    ...feed.authors.flatMap((author) => [author.url, author.avatar].filter(Boolean) as string[]),
    ...feed.items.flatMap((item) => [
      item.id,
      item.url,
      ...item.authors.flatMap((author) => [author.url, author.avatar].filter(Boolean) as string[]),
    ]),
  ];
  absoluteUrls.forEach((url) => auditUrl(violations, file, url, ORIGIN, true));
  feed.items.forEach((item) => {
    for (const match of (item.content_html ?? "").matchAll(/<a\b[^>]*>/gi)) {
      const href = attribute(match[0], "href");
      if (href) auditUrl(violations, file, href, item.url, false);
    }
  });
};

const auditTextArtifact = (violations: Violation[], file: string): void => {
  const contents = readFileSync(file, "utf8");
  const urls = contents.match(/https?:\/\/(?:www\.)?artka\.dev[^\s<"'\\)\],]*/g) ?? [];
  urls.forEach((url) => auditUrl(violations, file, url, ORIGIN, true));
};

it("emits one apex HTTPS slash identity for every internal document URL", () => {
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
  auditTextArtifact(violations, join(ROOT, "public", "llms.txt"));

  expect(violations).toEqual([]);
});
