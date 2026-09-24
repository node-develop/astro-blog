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
