// Every hreflang alternate on a built lesson/project page must point at a page
// that was actually built, and a page advertises its twin exactly when the twin
// exists. `checkCounterpartExists` is unit-tested in
// tests/unit/i18n/counterpart-honesty.test.ts; this checks the real build.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { getCounterpart, getLocaleFromPath } from "~/lib/i18n/routing";

const CLIENT = join(process.cwd(), "dist", "client");
const ORIGIN = "https://artka.dev";
const COLLECTION_PAGE =
  /^(?:en\/)?(?:courses\/[^/]+(?:\/[^/]+)?|projects\/[^/]+|blog\/[^/]+)\/index\.html$/;

const collectHtml = (dir: string): readonly string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return collectHtml(full);
    return entry.isFile() && entry.name.endsWith(".html") ? [full] : [];
  });

/** Paths of the `<link rel="alternate" hreflang>` targets that live on this site. */
const alternatePaths = (markup: string): readonly string[] =>
  [...markup.matchAll(/<link\b[^>]*\brel="alternate"[^>]*>/gi)]
    .filter(([tag]) => /\bhreflang="/i.test(tag))
    .map(([tag]) => /\bhref="([^"]*)"/i.exec(tag)?.[1])
    .filter((href): href is string => href !== undefined && href.startsWith(`${ORIGIN}/`))
    .map((href) => new URL(href).pathname);

const builtFileFor = (pathname: string): string =>
  join(CLIENT, ...pathname.split("/").filter(Boolean), "index.html");

describe("hreflang targets of the built collection pages", () => {
  const pages = collectHtml(CLIENT)
    .map((file) => relative(CLIENT, file).split("\\").join("/"))
    .filter((file) => COLLECTION_PAGE.test(file));

  it("every advertised alternate is a page that was built", () => {
    const lessons = pages.filter((p) => /courses\/[^/]+\/[^/]+\/index\.html$/.test(p));
    const projects = pages.filter((p) => /projects\/[^/]+\/index\.html$/.test(p));
    expect(lessons.length).toBeGreaterThan(0);
    expect(projects.length).toBeGreaterThan(0);

    const withCluster = pages.filter(
      (page) => alternatePaths(readFileSync(join(CLIENT, page), "utf8")).length > 0,
    );
    expect(withCluster.length).toBeGreaterThan(0);

    for (const page of withCluster) {
      for (const target of alternatePaths(readFileSync(join(CLIENT, page), "utf8"))) {
        expect(existsSync(builtFileFor(target)), `${page} advertises ${target}`).toBe(true);
      }
    }
  });

  it("a page advertises its twin exactly when the twin was built", () => {
    for (const page of pages) {
      const pathname = `/${page.replace(/index\.html$/, "")}`;
      const locale = getLocaleFromPath(pathname);
      const twin = getCounterpart(pathname, locale);
      const advertised = alternatePaths(readFileSync(join(CLIENT, page), "utf8"));
      expect(advertised.includes(twin), `${pathname} → ${twin}`).toBe(
        existsSync(builtFileFor(twin)),
      );
    }
  });
});
