import { EXIT, visit } from "unist-util-visit";
import type { Plugin } from "unified";
import type { Root } from "mdast";

/**
 * KaTeX's ~30 KB CSS is dead weight on every non-math page. This plugin
 * walks the mdast produced by remark-math and, when it finds a "math" or
 * "inlineMath" node, sets `frontmatter.hasMath = true` on the file. Route
 * files read the flag off `remarkPluginFrontmatter` and only then emit a
 * per-page `<link>` to `katex/dist/katex.min.css?url`. Compare node.type
 * as a string rather than importing mdast-util-math types — no new
 * dependency for a single string check.
 *
 * Must run AFTER remark-math in the plugin chain, since it depends on
 * remark-math having already inserted the "math"/"inlineMath" nodes.
 */
const remarkFlagMath: Plugin<[], Root> = () => (tree, file) => {
  const astroFile = file.data.astro as { frontmatter?: Record<string, unknown> } | undefined;
  if (!astroFile?.frontmatter) {
    throw new Error(
      "remark-flag-math: file.data.astro.frontmatter is missing; KaTeX CSS would be silently dropped",
    );
  }

  let hasMath = false;
  visit(tree, (node) => {
    if (node.type === "math" || node.type === "inlineMath") {
      hasMath = true;
      return EXIT;
    }
    return undefined;
  });

  if (hasMath) astroFile.frontmatter.hasMath = true;
};

export default remarkFlagMath;
