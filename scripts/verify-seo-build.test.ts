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

  it("passes on the OG sources actually in the repo", async () => {
    expect(await assertOgAuthorNames()).toEqual([]);
  });
});
