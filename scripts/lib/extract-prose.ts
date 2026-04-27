import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import { visit, SKIP } from "unist-util-visit";
import type { Root, Code, Link, Node, Parent } from "mdast";

export interface ProsePlaceholder {
  readonly id: number;
  readonly text: string;
  readonly kind: "prose" | "mermaid";
}

export interface ExtractOptions {
  readonly rewriteInternalLink?: (url: string) => string | undefined;
}

export interface ExtractResult {
  readonly placeholders: readonly ProsePlaceholder[];
  readonly skeleton: string;
}

const PLACEHOLDER = (id: number): string => `<!--T${id}-->`;
const MERMAID_LANG_SENTINEL = "__placeholder_mermaid";

const TRANSLATABLE_BLOCKS = new Set([
  "heading",
  "paragraph",
  "blockquote",
  "listItem",
  "tableCell",
  "footnoteDefinition",
]);

// Nodes that are frozen leaves — no translatable prose inside
const FROZEN_LEAF = new Set(["code", "inlineCode", "math", "inlineMath", "html", "yaml", "toml"]);

const buildProcessor = () =>
  unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ["yaml", "toml"])
    .use(remarkGfm)
    .use(remarkMath);

const buildSerializer = () =>
  unified()
    .use(remarkFrontmatter, ["yaml", "toml"])
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkStringify, {
      bullet: "-",
      emphasis: "_",
      listItemIndent: "one",
      fences: true,
      rule: "-",
    } as Parameters<typeof remarkStringify>[0]);

export const extractProse = (markdown: string, options: ExtractOptions = {}): ExtractResult => {
  const tree = buildProcessor().parse(markdown) as Root;

  const placeholders: ProsePlaceholder[] = [];
  let nextId = 0;

  // Optionally rewrite link URLs in-place before any extraction
  if (options.rewriteInternalLink) {
    visit(tree, "link", (node: Link) => {
      const newUrl = options.rewriteInternalLink!(node.url);
      if (typeof newUrl === "string") {
        node.url = newUrl;
      }
    });
  }

  // Mermaid blocks: capture body, replace value with placeholder, mark lang with sentinel
  // Must run before the TRANSLATABLE_BLOCKS pass so the code node is already frozen
  visit(tree, "code", (node: Code) => {
    if (node.lang === "mermaid") {
      const id = nextId++;
      placeholders.push({ id, text: node.value, kind: "mermaid" });
      node.value = PLACEHOLDER(id);
      node.lang = MERMAID_LANG_SENTINEL;
      return SKIP;
    }
    return undefined;
  });

  // Walk translatable block-level containers.
  // Capture raw markdown slice via position offsets — byte-perfect inline formatting.
  // When rewriteInternalLink is active, post-process the raw slice to apply URL rewrites
  // by substituting matched link URLs, mirroring the AST mutations already applied above.
  // Then mutate the node into an `html` node so remark-stringify emits the comment verbatim.
  visit(tree, (node: Node, _index, _parent) => {
    if (!TRANSLATABLE_BLOCKS.has(node.type)) return undefined;

    const pos = node.position;
    if (!pos) return undefined;
    const startOffset = pos.start.offset;
    const endOffset = pos.end.offset;
    if (startOffset === undefined || endOffset === undefined) return undefined;

    // Skip blocks composed entirely of frozen leaves (e.g. paragraph with only inlineCode)
    const children = (node as unknown as Parent).children ?? [];
    const hasTranslatableChild =
      children.length === 0 || children.some((c) => !FROZEN_LEAF.has(c.type) && c.type !== "break");

    if (!hasTranslatableChild) return SKIP;

    let rawText = markdown.slice(startOffset, endOffset);
    if (!rawText.trim()) return SKIP;

    // If link URL rewriting is active, apply the same rewrites to the raw-text slice.
    // Matches markdown inline link syntax `](url)` and image `](url)`.
    if (options.rewriteInternalLink) {
      rawText = rawText.replace(/\]\(([^)]+)\)/g, (_match, url: string) => {
        const rewritten = options.rewriteInternalLink!(url);
        return `](${rewritten ?? url})`;
      });
    }

    const id = nextId++;
    placeholders.push({ id, text: rawText, kind: "prose" });

    // Mutate this node into an html comment — remark-stringify passes html nodes through verbatim
    const mutable = node as unknown as Record<string, unknown>;
    mutable.type = "html";
    mutable.value = PLACEHOLDER(id);
    delete mutable.children;
    delete mutable.depth;
    delete mutable.ordered;
    delete mutable.spread;
    delete mutable.checked;
    delete mutable.align;

    return SKIP;
  });

  let skeleton = buildSerializer().stringify(tree);

  // Restore mermaid lang in the skeleton string (sentinel → "mermaid")
  skeleton = skeleton.replace(new RegExp("```" + MERMAID_LANG_SENTINEL, "g"), "```mermaid");

  return { placeholders, skeleton };
};

export const reassemble = (
  skeleton: string,
  translated: readonly { id: number; text: string }[],
): string => {
  let result = skeleton;
  for (const { id, text } of translated) {
    const re = new RegExp(`<!--T${id}-->`, "g");
    result = result.replace(re, text);
  }
  return result;
};
