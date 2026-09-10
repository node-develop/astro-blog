import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { VFile } from "vfile";
import remarkFlagMath from "~/lib/remark/flag-math";

type AstroFileData = { frontmatter: Record<string, unknown> };

const processor = () => unified().use(remarkParse).use(remarkMath).use(remarkFlagMath);

const run = (markdown: string): VFile => {
  const file = new VFile(markdown);
  (file.data as { astro?: AstroFileData }).astro = { frontmatter: {} };
  const tree = processor().parse(file);
  processor().runSync(tree, file);
  return file;
};

const readHasMathFlag = (file: VFile): unknown =>
  (file.data as { astro?: AstroFileData }).astro?.frontmatter.hasMath;

describe("remarkFlagMath", () => {
  it("flags frontmatter.hasMath = true for inline math", () => {
    const file = run("some text with $x^2$ inline math");
    expect(readHasMathFlag(file)).toBe(true);
  });

  it("flags frontmatter.hasMath = true for block math", () => {
    const file = run("$$\n\\int\n$$");
    expect(readHasMathFlag(file)).toBe(true);
  });

  it("leaves frontmatter.hasMath unset for plain text", () => {
    const file = run("just plain text, no math here");
    expect(readHasMathFlag(file)).toBeUndefined();
  });

  it("throws when file.data.astro.frontmatter is missing (fail loud, not silent CSS drop)", () => {
    const file = new VFile("$x^2$");
    const tree = processor().parse(file);
    expect(() => processor().runSync(tree, file)).toThrow(
      /file\.data\.astro\.frontmatter is missing/,
    );
  });
});

describe("layouts wire hasMath to a conditional KaTeX <link>", () => {
  const LAYOUTS = [
    "src/layouts/PostLayout.astro",
    "src/layouts/LessonLayout.astro",
    "src/layouts/CourseLayout.astro",
  ] as const;

  it.each(LAYOUTS)("%s imports katex.min.css and gates it behind hasMath", (relPath) => {
    const source = readFileSync(join(process.cwd(), relPath), "utf8");
    expect(source).toMatch(/katex\/dist\/katex\.min\.css\?url/);
    expect(source).toMatch(/\{hasMath\s*&&\s*<link\s+rel="stylesheet"/);
  });
});
