import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { load } from "~/lib/yaml";

/**
 * The SERP title budget lives in BaseLayout as a number; these tests assert the
 * rule that number expresses, not the exact copy of any one page:
 *
 *   - the brand suffix is dropped when it would push the title over the budget;
 *   - og:title / twitter:title carry the bare title (og:site_name has the brand);
 *   - the titles pages actually build stay inside the budget, or at worst are
 *     exactly what the content itself says, with nothing added by a layout.
 */

const repoFile = (rel: string): string => join(process.cwd(), rel);
const read = (rel: string): string => readFileSync(repoFile(rel), "utf8");

const baseLayout = read("src/layouts/BaseLayout.astro");
const lessonLayout = read("src/layouts/LessonLayout.astro");

const readStrings = (rel: string): Record<string, string> =>
  JSON.parse(read(rel)) as Record<string, string>;
const ruStrings = readStrings("src/i18n/strings.ru.json");
const enStrings = readStrings("src/i18n/strings.en.json");

/** Lesson files of a course directory, `_index.md` excluded, in lesson order. */
const lessonFiles = (dir: string): readonly string[] =>
  readdirSync(repoFile(dir))
    .filter((file) => file.endsWith(".md") && file !== "_index.md")
    .sort();

/** The budget as BaseLayout declares it — the tests below derive from it. */
const budgetFrom = (source: string, name: string): number => {
  const match = new RegExp(`const ${name} = (\\d+);`).exec(source);
  if (!match?.[1]) throw new Error(`${name} not found`);
  return Number(match[1]);
};

const BRAND = "artka.dev";
const TITLE_BUDGET = budgetFrom(baseLayout, "TITLE_BUDGET");

/** Mirror of BaseLayout's rule, used to score the titles pages hand it. */
const serpTitle = (title: string): string => {
  const withBrand = `${title} | ${BRAND}`;
  return title.includes(BRAND) || withBrand.length > TITLE_BUDGET ? title : withBrand;
};

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

describe("BaseLayout title budget", () => {
  it("budgets around the ~600px Google gives a SERP title", () => {
    expect(TITLE_BUDGET).toBe(60);
    // The number is a judgement call, so the reasoning has to travel with it.
    expect(baseLayout).toMatch(/600\s*px/);
  });

  it("drops the brand suffix instead of overflowing the budget", () => {
    // Long title: the brand goes, the meaningful words stay.
    const long = "Работа с агентом: от понятной задачи до проверенного изменения";
    expect(serpTitle(long)).toBe(long);
    // Short title: there is room, so the brand is appended as before.
    expect(serpTitle("Обо мне")).toBe(`Обо мне | ${BRAND}`);
    // A title that already names the brand is never suffixed twice.
    expect(serpTitle(`${BRAND} — Artyom Kashuta`)).toBe(`${BRAND} — Artyom Kashuta`);
    // And the source states the rule the mirror above copies.
    expect(baseLayout).toMatch(/titleWithBrand\.length > TITLE_BUDGET \? title : titleWithBrand/);
  });

  it("keeps the brand out of the social card headline but not out of the card", () => {
    expect(baseLayout).toMatch(/property="og:title" content=\{title\}/);
    expect(baseLayout).toMatch(/name="twitter:title" content=\{title\}/);
    expect(baseLayout).toMatch(/property="og:site_name" content="artka\.dev"/);
    // The <title> element is the one place the suffixed form belongs.
    expect(baseLayout).toMatch(/<title>\{fullTitle\}<\/title>/);
  });
});

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
    expect(serpTitle(title).length).toBeLessThanOrEqual(TITLE_BUDGET);
  });

  it("gives the blog index a title that names what is on the page", () => {
    // The old title was the bare nav label ("Статьи"), which carried no keyword.
    for (const strings of [ruStrings, enStrings]) {
      expect(requireString(strings, "meta.blog.title")).not.toBe(
        requireString(strings, "blog.title"),
      );
      for (const key of ["meta.blog.title", "tags.archiveTitle"]) {
        expect(requireString(strings, key).length).toBeGreaterThan(20);
      }
    }
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

describe("lesson titles", () => {
  const courseDirs = [
    "src/content/courses/claude-code-guide",
    "src/content/courses/claude-code-guide/en",
  ] as const;

  const lessons = courseDirs.flatMap((dir) => {
    const course = str(`${dir}/_index.md`, "title");
    return lessonFiles(dir).map((file) => ({
      id: `${dir}/${file}`,
      lesson: str(`${dir}/${file}`, "title"),
      course,
    }));
  });

  it("finds the course lessons", () => {
    expect(lessons.length).toBeGreaterThan(0);
  });

  it("never lets the layout push a lesson title past the budget", () => {
    for (const { id, lesson, course } of lessons) {
      const withCourse = `${lesson} — ${course}`;
      const pageTitle = withCourse.length > TITLE_BUDGET ? lesson : withCourse;
      const rendered = serpTitle(pageTitle);
      // Either it fits, or the layout added nothing at all and what is left is
      // the lesson's own title — anything longer is the writer's call, not ours.
      expect(rendered.length <= TITLE_BUDGET || rendered === lesson, `${id}: ${rendered}`).toBe(
        true,
      );
    }
  });

  it("drops the ordinal number, which the URL and the breadcrumbs already show", () => {
    expect(lessonLayout).not.toMatch(/\$\{index\}\.\s/);
    expect(lessonLayout).toMatch(/const pageTitle =/);
    // `index` is still needed for the eyebrow and the LearningResource position.
    expect(lessonLayout).toMatch(/position: index/);
  });

  it("hands lessons the course preview image instead of the site placeholder", () => {
    expect(lessonLayout).toMatch(/landingOgPath\("course-ccg", locale\)/);
    expect(lessonLayout).toMatch(/ogImage: ogImagePath/);
  });
});

describe("tag archives get the section preview image", () => {
  it.each(["src/pages/tags/[tag].astro", "src/pages/en/tags/[tag].astro"])("%s", (rel) => {
    const source = read(rel);
    expect(source).toMatch(/landingOgPath\("tags", "(?:ru|en)"\)/);
    expect(source).toMatch(/ogImage=\{ogImagePath\}/);
  });
});
