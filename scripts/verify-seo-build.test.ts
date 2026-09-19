import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertOgAuthorNames,
  assertSeoBuildOutput,
  diagnoseSeoBuildOutput,
} from "./verify-seo-build";
import { person } from "../src/lib/seo/person";

describe("assertSeoBuildOutput", () => {
  it("accepts clean build output", () => {
    expect(assertSeoBuildOutput("build complete\n")).toEqual([]);
  });

  it("detects a duplicate redirect route warning", () => {
    expect(assertSeoBuildOutput("static route cannot be defined more than once")).toContain(
      "duplicate redirect route",
    );
  });

  it("detects the invalid view-transition selector warning", () => {
    expect(
      assertSeoBuildOutput('::view-transition-group([transition-name^="post-title"])'),
    ).toContain("invalid view-transition selector");
  });

  it("detects the SEO chunk-cycle warning", () => {
    expect(assertSeoBuildOutput("buildLandingNodes is reexported through module")).toContain(
      "SEO chunk cycle",
    );
  });

  it("reports each warning family at most once", () => {
    expect(
      assertSeoBuildOutput(
        "static route cannot be defined more than once\nstatic route cannot be defined more than once",
      ),
    ).toEqual(["duplicate redirect route"]);
  });

  it("prints context for an SEO chunk-cycle warning that spans lines", () => {
    const output = [
      "rendering server chunks",
      "buildLandingNodes is imported from landing.ts",
      "and reexported through module schema.ts while both modules depend on each other",
      "build complete",
    ].join("\n");

    expect(diagnoseSeoBuildOutput(output)).toEqual([
      {
        label: "SEO chunk cycle",
        block: expect.stringContaining("reexported through module schema.ts"),
      },
    ]);
    expect(diagnoseSeoBuildOutput(output)[0]?.block).not.toContain("unavailable");
  });
});

/**
 * The byline regression these cover shipped a stranger's name on every social
 * card of the site for months: it lives in a PNG, so no HTML assertion and no
 * page-level test could see it. The guard is the only thing standing between
 * that and production.
 */
describe("assertOgAuthorNames", () => {
  const CLEAN_OG_IMAGE = [
    'import { person } from "~/lib/seo/person";',
    'const fonts = ["Source Serif 4", "JetBrains Mono", "Inter"];',
    "export const byline = (override?: string): string => override ?? person.name;",
    "export { fonts };",
    "",
  ].join("\n");

  let root = "";

  const write = async (rel: string, source: string): Promise<void> => {
    const full = join(root, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, source, "utf8");
  };

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "og-author-names-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("accepts sources whose byline comes from person.name", async () => {
    await write("src/lib/og/og-image.ts", CLEAN_OG_IMAGE);

    expect(await assertOgAuthorNames(["src/lib/og"], root)).toEqual([]);
  });

  it("rejects a foreign name hardcoded as the byline fallback", async () => {
    await write("src/lib/og/og-image.ts", `${CLEAN_OG_IMAGE}const fallback = "Someone Else";\n`);

    const issues = await assertOgAuthorNames(["src/lib/og"], root);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("Someone Else");
  });

  it("rejects a name left behind in a commented-out example", async () => {
    await write("src/lib/og/og-image.ts", `// byline, e.g. "Someone Else"\n${CLEAN_OG_IMAGE}`);

    expect(await assertOgAuthorNames(["src/lib/og"], root)).toHaveLength(1);
  });

  it("rejects a copy of the canonical name instead of the import", async () => {
    await write(
      "src/lib/og/og-image.ts",
      CLEAN_OG_IMAGE.replace("override ?? person.name", `override ?? "${person.name}"`),
    );

    const issues = await assertOgAuthorNames(["src/lib/og"], root);

    expect(issues.join("\n")).toContain("Import person from ~/lib/seo/person");
  });

  it("rejects dropping the person.name fallback entirely", async () => {
    await write("src/lib/og/og-image.ts", 'export const byline = (): string => "";\n');

    expect(await assertOgAuthorNames(["src/lib/og"], root).then((i) => i.join("\n"))).toContain(
      "person.name",
    );
  });

  it("does not flag the Satori font-family literal", async () => {
    await write("src/lib/og/fonts.ts", 'export const title = "Source Serif 4";\n');
    await write("src/lib/og/og-image.ts", CLEAN_OG_IMAGE);

    expect(await assertOgAuthorNames(["src/lib/og"], root)).toEqual([]);
  });

  // Built in code so no editor or formatter can quietly turn it into a space.
  const NBSP = String.fromCharCode(0xa0);

  it.each([
    ["the Cyrillic canonical name", person.alternateName, `const a = "${person.alternateName}";`],
    ["a foreign Cyrillic name", "Кто Другой", 'const a = "Кто Другой";'],
    ["a template literal", "Someone Else", "const a = `by Someone Else · ${x}`;"],
    ["a single-quoted literal", "Someone Else", "const a = 'Someone Else';"],
    [
      "a name joined by a real non-breaking space",
      person.name.replace(" ", NBSP),
      `const a = "${person.name.replace(" ", NBSP)}";`,
    ],
  ])("rejects a name planted as %s", async (_shape, name, planted) => {
    await write("src/lib/og/og-image.ts", `${CLEAN_OG_IMAGE}${planted}\n`);

    const issues = await assertOgAuthorNames(["src/lib/og"], root);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain(name);
  });

  it("gives a copy of the Cyrillic canonical name the same advice as a copy of person.name", async () => {
    const adviceFor = async (name: string): Promise<string> => {
      await write("src/lib/og/og-image.ts", `${CLEAN_OG_IMAGE}const a = "${name}";\n`);
      const issues = await assertOgAuthorNames(["src/lib/og"], root);
      expect(issues).toHaveLength(1);
      return (issues[0] ?? "").replaceAll(name, "<name>");
    };

    expect(await adviceFor(person.alternateName)).toBe(await adviceFor(person.name));
    expect(await adviceFor("Кто Другой")).not.toBe(await adviceFor(person.name));
  });

  it("scans nested route folders under the default roots", async () => {
    const nested = "src/pages/og/lesson/[course]/[lesson].png.ts";
    await write("src/lib/og/og-image.ts", CLEAN_OG_IMAGE);
    await write(nested, 'export const card = { byline: "Someone Else" };\n');

    const issues = await assertOgAuthorNames(undefined, root);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain(nested);
  });

  it("rejects a fallback that keeps the person import but no longer reads person.name", async () => {
    await write(
      "src/lib/og/og-image.ts",
      CLEAN_OG_IMAGE.replace("override ?? person.name", "override ?? person.jobTitle"),
    );

    const issues = await assertOgAuthorNames(["src/lib/og"], root);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("person.name");
  });

  it("rejects a person.name that no longer comes from the person module", async () => {
    await write(
      "src/lib/og/og-image.ts",
      CLEAN_OG_IMAGE.replace(
        'import { person } from "~/lib/seo/person";',
        'const person = { name: "" };',
      ),
    );

    const issues = await assertOgAuthorNames(["src/lib/og"], root);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("person.name");
  });

  it.each(["tsx", "jsx", "js", "mjs", "astro", "json"])(
    "refuses a .%s file under an OG root instead of skipping it",
    async (ext) => {
      await write("src/lib/og/og-image.ts", CLEAN_OG_IMAGE);
      await write(`src/lib/og/card.${ext}`, 'export const byline = "Someone Else";\n');

      const issues = await assertOgAuthorNames(["src/lib/og"], root);

      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain(`src/lib/og/card.${ext}`);
    },
  );

  it("ignores extensionless OS dotfiles but still scans a dot-prefixed source file", async () => {
    await write("src/lib/og/og-image.ts", CLEAN_OG_IMAGE);
    await write("src/lib/og/.DS_Store", "Someone Else");
    expect(await assertOgAuthorNames(["src/lib/og"], root)).toEqual([]);

    await write("src/lib/og/.hidden.ts", 'export const guest = "Someone Else";\n');
    const issues = await assertOgAuthorNames(["src/lib/og"], root);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("src/lib/og/.hidden.ts");
  });

  it("still scans the .ts sibling of a file type it cannot read", async () => {
    await write("src/lib/og/og-image.ts", CLEAN_OG_IMAGE);
    await write("src/lib/og/card.tsx", "export const Card = () => <div>Someone Else</div>;\n");
    await write("src/lib/og/guest.ts", 'export const guest = "Someone Else";\n');

    const issues = await assertOgAuthorNames(["src/lib/og"], root);

    expect(issues).toHaveLength(2);
    expect(issues.filter((issue) => issue.includes("src/lib/og/card.tsx"))).toHaveLength(1);
    expect(issues.filter((issue) => issue.includes("src/lib/og/guest.ts"))).toHaveLength(1);
  });

  it("passes on the OG sources actually in the repo", async () => {
    expect(await assertOgAuthorNames()).toEqual([]);
  });
});
