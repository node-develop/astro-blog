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
// build-time guard is the only thing that catches a lesson published in one
// language before it ships.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
    readonly locale?: Locale;
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

/** Every combination the routes can meet: paired, one-sided, draft, unflagged. */
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
  course: [
    { id: "guide/_index", data: { locale: "ru" } },
    { id: "guide/en/_index", data: { locale: "en" } },
    { id: "ru-only-course/_index", data: { locale: "ru" } },
    { id: "en-only-course/en/_index", data: { locale: "en" } },
  ],
  lesson: [
    { id: "guide/01-paired", data: { locale: "ru" } },
    { id: "guide/en/01-paired", data: { locale: "en" } },
    { id: "guide/15-ru-only", data: { locale: "ru" } },
    { id: "guide/en/16-en-only", data: { locale: "en" } },
    // EN file without `locale: en`: the EN route skips it.
    { id: "guide/17-unflagged-twin", data: { locale: "ru" } },
    { id: "guide/en/17-unflagged-twin", data: { locale: "ru" } },
    // Twin files exist, but the course has no landing in the other language.
    { id: "ru-only-course/01-intro", data: { locale: "ru" } },
    { id: "ru-only-course/en/01-intro", data: { locale: "en" } },
    { id: "en-only-course/01-intro", data: { locale: "ru" } },
    { id: "en-only-course/en/01-intro", data: { locale: "en" } },
  ],
};

// --- independent mirror of the page routes ---------------------------------
// Written from src/pages/**/getStaticPaths, NOT from routing.ts: list the
// entries the route takes, then derive the URL the way the route derives it.

const lastSegment = (id: string): string => id.replace(/^.*\//, "");

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

  const inLocale = (e: MockEntry): boolean =>
    en ? e.data.locale === "en" : e.data.locale !== "en";
  const courses = (c["course"] ?? []).filter(inLocale);
  const lessons = (c["lesson"] ?? []).filter(inLocale);
  const coursePages = courses.flatMap((course) => {
    const slug = course.id.replace(en ? /\/en\/?_index$/ : /\/?_index$/, "");
    const lessonPrefix = en ? `${slug}/en/` : `${slug}/`;
    return [
      `${prefix}/courses/${slug}/`,
      ...lessons
        .filter((l) => l.id.startsWith(lessonPrefix))
        .map((l) => `${prefix}/courses/${slug}/${lastSegment(l.id)}/`),
    ];
  });

  return new Set([...posts, ...projects, ...sitePages, ...coursePages]);
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

  it("covers a lesson with a twin, one without, a project without, and a draft twin", async () => {
    expect(await checkCounterpartExists("/courses/guide/01-paired/", "ru")).toBe(true);
    expect(await checkCounterpartExists("/courses/guide/15-ru-only/", "ru")).toBe(false);
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

// --- the real build ----------------------------------------------------------

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
  const hasBuild = existsSync(join(CLIENT, "courses")) && existsSync(join(CLIENT, "projects"));
  const pages = hasBuild
    ? collectHtml(CLIENT)
        .map((file) => relative(CLIENT, file).split("\\").join("/"))
        .filter((file) => COLLECTION_PAGE.test(file))
    : [];

  it.skipIf(!hasBuild)("every advertised alternate is a page that was built", () => {
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

  it.skipIf(!hasBuild)("a page advertises its twin exactly when the twin was built", () => {
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

// --- the build-time guard ------------------------------------------------------

const SCRIPT = join(process.cwd(), "scripts", "translate-check.ts");
const TSX = join(process.cwd(), "node_modules", ".bin", "tsx");

const lessonFile = (title: string, locale?: Locale): string =>
  `---\ntitle: "${title}"\npubDate: 2026-04-23\n${locale ? `locale: ${locale}\n` : ""}---\n\nBody.\n`;
const courseFile = (title: string, locale?: Locale): string =>
  `---\ntitle: "${title}"\nblurb: "Blurb"\npubDate: 2026-04-23\n${locale ? `locale: ${locale}\n` : ""}---\n\nBody.\n`;

describe("pnpm translate:check on courses and lessons", () => {
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
    const result = spawnSync(TSX, [SCRIPT], { cwd: root, encoding: "utf8" });
    return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
  };

  const pairedCourse = {
    "courses/guide/_index.md": courseFile("Курс"),
    "courses/guide/en/_index.md": courseFile("Course", "en"),
    "courses/guide/01-intro.md": lessonFile("Урок"),
    "courses/guide/en/01-intro.md": lessonFile("Lesson", "en"),
  };

  it("passes when every lesson has a built twin", () => {
    const result = runCheck(pairedCourse);
    expect(result.output).toContain("in sync");
    expect(result.status).toBe(0);
  });

  it("fails on a lesson published in Russian only", () => {
    const result = runCheck({
      ...pairedCourse,
      "courses/guide/15-new.md": lessonFile("Пятнадцатый урок"),
    });
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/Missing EN twins:.*lessons\/guide\/15-new/);
    // pnpm translate does not produce lessons, so it must not be the advice.
    expect(result.output).not.toContain("Run `pnpm translate`");
    expect(result.output).toContain("NOT covered by `pnpm translate`");
  });

  it("fails on an EN lesson file the EN route would not build", () => {
    const result = runCheck({
      ...pairedCourse,
      "courses/guide/02-cache.md": lessonFile("Кеш"),
      "courses/guide/en/02-cache.md": lessonFile("Cache"),
    });
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/no page route builds:.*lessons\/guide\/02-cache \(en\)/);
  });

  it("fails on a project and a site page without a twin, in either direction", () => {
    const result = runCheck({
      ...pairedCourse,
      "projects/ru-only.md": "---\ntitle: x\n---\n",
      "site/en/orphan.md": "---\ntitle: Orphan\n---\n",
    });
    expect(result.status).toBe(1);
    expect(result.output).toMatch(/Missing EN twins:.*projects\/ru-only/);
    expect(result.output).toMatch(/without a RU source:.*site\/orphan/);
  });

  it("keeps skipping e2e fixtures", () => {
    const result = runCheck({
      ...pairedCourse,
      "courses/guide/e2e-ru-only.md": lessonFile("Фикстура"),
      "projects/e2e-ru-only.md": "---\ntitle: x\n---\n",
    });
    expect(result.status).toBe(0);
  });
});
