// checkCounterpartExists feeds the hreflang cluster and the language toggle, so
// a wrong "yes" advertises an address that answers 404 to a crawler. The rule:
//
//   for every page the site builds from a localised collection, the answer is
//   `true` exactly when the twin page is built too.
//
// It is held three ways: against mocked collections (with an independent mirror
// of the page routes' getStaticPaths), against the real src/pages tree for the
// routes that get an unconditional "yes", and against the real build output.
// The last block runs translate-check on a throwaway content tree, because the
// build-time guard is the only thing that catches a page published in one
// language before it ships.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkCounterpartExists,
  getCounterpart,
  getLocaleFromPath,
  PAIRED_STATIC_ROUTES,
  SITE_ENTRY_PAGES,
} from "~/lib/i18n/routing";

type Locale = "ru" | "en";

interface MockEntry {
  readonly id: string;
  readonly data: {
    readonly draft?: boolean;
    readonly tags?: readonly string[];
  };
}

type MockCollections = Readonly<Record<string, readonly MockEntry[]>>;

const store = vi.hoisted(() => ({ collections: {} as Record<string, readonly unknown[]> }));

vi.mock("astro:content", () => ({
  getCollection: vi.fn(async (name: string, filter?: (e: unknown) => boolean) => {
    const all = store.collections[name] ?? [];
    return filter ? all.filter(filter) : all;
  }),
}));

const useCollections = (collections: MockCollections): void => {
  store.collections = { ...collections };
};

/** Every combination the routes can meet: paired, one-sided, draft. */
const MIXED: MockCollections = {
  posts: [
    { id: "paired-post", data: { draft: false, tags: [] } },
    { id: "en/paired-post", data: { draft: false, tags: [] } },
    { id: "ru-only-post", data: { draft: false, tags: [] } },
    { id: "en/en-only-post", data: { draft: false, tags: [] } },
    { id: "draft-twin-post", data: { draft: false, tags: [] } },
    { id: "en/draft-twin-post", data: { draft: true, tags: [] } },
    { id: "draft-source-post", data: { draft: true, tags: [] } },
    { id: "en/draft-source-post", data: { draft: false, tags: [] } },
  ],
  projects: [
    { id: "paired-project", data: {} },
    { id: "en/paired-project", data: {} },
    { id: "ru-only-project", data: {} },
    { id: "en/en-only-project", data: {} },
  ],
  site: [
    { id: "home", data: {} },
    { id: "en/home", data: {} },
    { id: "about", data: {} },
    { id: "en/about", data: {} },
    { id: "now", data: {} },
    { id: "en/uses", data: {} },
  ],
};

// --- independent mirror of the page routes ---------------------------------
// Written from src/pages/**/getStaticPaths, NOT from routing.ts: list the
// entries the route takes, then derive the URL the way the route derives it.

const builtPaths = (c: MockCollections, locale: Locale): ReadonlySet<string> => {
  const en = locale === "en";
  const prefix = en ? "/en" : "";
  const ofLocale = (id: string): boolean => id.startsWith("en/") === en;

  const posts = (c["posts"] ?? [])
    .filter((e) => !e.data.draft && ofLocale(e.id))
    .map((e) => `${prefix}/blog/${e.id.replace(/^en\//, "")}/`);

  const projects = (c["projects"] ?? [])
    .filter((e) => ofLocale(e.id))
    .map((e) => `${prefix}/projects/${e.id.replace(/^en\//, "")}/`);

  const sitePages = SITE_ENTRY_PAGES.filter((slug) =>
    (c["site"] ?? []).some((e) => e.id === (en ? `en/${slug}` : slug)),
  ).map((slug) => `${prefix}/${slug}/`);

  return new Set([...posts, ...projects, ...sitePages]);
};

describe("checkCounterpartExists against the pages the routes build", () => {
  beforeEach(() => useCollections(MIXED));

  it.each(["ru", "en"] as const)(
    "is true exactly when the twin page is built (%s pages)",
    async (locale) => {
      const own = builtPaths(MIXED, locale);
      const other = builtPaths(MIXED, locale === "ru" ? "en" : "ru");
      // The fixture has to exercise both answers, or the loop proves nothing.
      const expected = [...own].map((path) => other.has(getCounterpart(path, locale)));
      expect(expected).toContain(true);
      expect(expected).toContain(false);

      for (const path of own) {
        const twinBuilt = other.has(getCounterpart(path, locale));
        expect(await checkCounterpartExists(path, locale), path).toBe(twinBuilt);
      }
    },
  );

  it("covers a post with a twin, one without, a project without, and a draft twin", async () => {
    expect(await checkCounterpartExists("/blog/paired-post/", "ru")).toBe(true);
    expect(await checkCounterpartExists("/blog/ru-only-post/", "ru")).toBe(false);
    expect(await checkCounterpartExists("/projects/ru-only-project/", "ru")).toBe(false);
    expect(await checkCounterpartExists("/blog/draft-twin-post/", "ru")).toBe(false);
  });
});

// --- the routes that get an unconditional "yes" ------------------------------

const PAGES = join(process.cwd(), "src", "pages");
const UTILITY = /^(admin|api)\//;

/** Static `.astro` routes (no params) as RU-form paths, split by language. */
const staticRoutes = (): { readonly ru: ReadonlySet<string>; readonly en: ReadonlySet<string> } => {
  const walk = (dir: string): readonly string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name.endsWith(".astro") ? [relative(PAGES, full)] : [];
    });
  const toRoute = (file: string): string => {
    const bare = file.replace(/\.astro$/, "").replace(/(^|\/)index$/, "");
    return bare === "" ? "/" : `/${bare}/`;
  };
  const files = walk(PAGES)
    .map((file) => file.split("\\").join("/"))
    .filter((file) => !file.includes("[") && !UTILITY.test(file.replace(/^en\//, "")));
  return {
    ru: new Set(files.filter((f) => !f.startsWith("en/")).map(toRoute)),
    en: new Set(files.filter((f) => f.startsWith("en/")).map((f) => toRoute(f.slice(3)))),
  };
};

describe("static routes", () => {
  const routes = staticRoutes();
  const vouchedFor: ReadonlySet<string> = new Set([
    ...PAIRED_STATIC_ROUTES,
    ...SITE_ENTRY_PAGES.map((slug) => `/${slug}/`),
  ]);

  beforeEach(() =>
    useCollections({
      site: SITE_ENTRY_PAGES.flatMap((slug) => [
        { id: slug, data: {} },
        { id: `en/${slug}`, data: {} },
      ]),
    }),
  );

  it("finds the static pages of both languages", () => {
    expect(routes.ru.size).toBeGreaterThan(0);
    expect(routes.en.size).toBeGreaterThan(0);
  });

  it("answer yes only where a page file exists in both languages", async () => {
    for (const route of new Set([...routes.ru, ...routes.en])) {
      const paired = routes.ru.has(route) && routes.en.has(route);
      if (routes.ru.has(route)) {
        expect(await checkCounterpartExists(route, "ru"), route).toBe(paired);
      }
      if (routes.en.has(route)) {
        const enPath = route === "/" ? "/en/" : `/en${route}`;
        expect(getLocaleFromPath(enPath)).toBe("en");
        expect(await checkCounterpartExists(enPath, "en"), enPath).toBe(paired);
      }
    }
  });

  it("names every paired static page, so none loses its hreflang silently", () => {
    const paired = [...routes.ru].filter((route) => routes.en.has(route)).sort();
    expect(paired).toEqual([...vouchedFor].sort());
  });
});

// --- the build-time guard ------------------------------------------------------

const SCRIPT = join(process.cwd(), "scripts", "translate-check.ts");
const TSX_LOADER = import.meta.resolve("tsx");

describe("pnpm translate:check on site pages and projects", () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  const runCheck = (
    files: Readonly<Record<string, string>>,
  ): { readonly status: number | null; readonly output: string } => {
    const root = mkdtempSync(join(tmpdir(), "translate-check-"));
    roots.push(root);
    mkdirSync(join(root, "src", "content", "posts"), { recursive: true });
    for (const [rel, content] of Object.entries(files)) {
      const file = join(root, "src", "content", rel);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content, "utf8");
    }
    // The script resolves content from process.cwd(), so the throwaway tree is
    // all it sees; its own imports resolve from the repo as usual.
    const result = spawnSync(process.execPath, ["--import", TSX_LOADER, SCRIPT], {
      cwd: root,
      encoding: "utf8",
    });
    return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
  };

  const pairedPage = {
    "site/about.md": "---\ntitle: Об авторе\n---\n",
    "site/en/about.md": "---\ntitle: About\n---\n",
  };

  it("passes when every page has its twin", () => {
    const result = runCheck(pairedPage);
    expect(result.output).toContain("in sync");
    expect(result.status).toBe(0);
  });

  it("fails on a project and a site page without a twin, in either direction", () => {
    const result = runCheck({
      ...pairedPage,
      "projects/ru-only.md": "---\ntitle: x\n---\n",
      "site/en/orphan.md": "---\ntitle: Orphan\n---\n",
    });
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/Missing EN twins:.*projects\/ru-only/);
    expect(result.output).toMatch(/without a RU source:.*site\/orphan/);
    expect(result.output).toContain("Run `pnpm translate`");
  });

  it("keeps skipping e2e fixtures", () => {
    const result = runCheck({
      ...pairedPage,
      "projects/e2e-ru-only.md": "---\ntitle: x\n---\n",
      "site/en/e2e-orphan.md": "---\ntitle: Orphan\n---\n",
    });
    expect(result.status).toBe(0);
  });
});
