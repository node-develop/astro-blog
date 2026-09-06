import type { Root } from "hast";
import type { Transformer } from "unified";
import { visit } from "unist-util-visit";

/**
 * `.prose table` scrolls horizontally on narrow viewports (overflow-x: auto in
 * prose.css). A scrollable region that keyboard users cannot reach fails
 * WCAG 2.1.1 (axe rule `scrollable-region-focusable`). Deque's fix when there
 * is no wrapper element is `tabindex="0"` on the scrollable element itself,
 * which this plugin adds to every Markdown/MDX table without an explicit tabindex.
 */
const focusableTables = (): Transformer<Root> => (tree) => {
  visit(tree, "element", (node) => {
    if (node.tagName !== "table") return;
    if (node.properties.tabIndex !== undefined) return;
    node.properties.tabIndex = 0;
  });
};

export default focusableTables;
