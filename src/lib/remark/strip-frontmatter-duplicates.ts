import { toString } from "mdast-util-to-string";
import type { Plugin } from "unified";
import type { Root, RootContent, Heading, Blockquote } from "mdast";

/** Strip markdown inline-code backtick pairs, punctuation/symbols, then collapse whitespace and lowercase. */
const normalize = (s: string): string =>
  s
    .replace(/`([^`]*)`/g, "$1")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // strip punctuation/symbols, keep letters/digits/space
    .trim()
    .replace(/\s+/g, " ");

type MaybeFrontmatter = { title?: string | undefined; description?: string | undefined };

const extractFrontmatter = (data: unknown): MaybeFrontmatter | null => {
  if (
    data !== null &&
    typeof data === "object" &&
    "astro" in data &&
    data.astro !== null &&
    typeof data.astro === "object" &&
    "frontmatter" in data.astro &&
    data.astro.frontmatter !== null &&
    typeof data.astro.frontmatter === "object"
  ) {
    const fm = data.astro.frontmatter as Record<string, unknown>;
    const result: MaybeFrontmatter = {};
    if (typeof fm["title"] === "string") result.title = fm["title"];
    if (typeof fm["description"] === "string") result.description = fm["description"];
    return result;
  }
  return null;
};

const isHeadingDepth1 = (node: RootContent): node is Heading =>
  node.type === "heading" && (node as Heading).depth === 1;

const isBlockquote = (node: RootContent): node is Blockquote => node.type === "blockquote";

const remarkStripFrontmatterDuplicates: Plugin<[], Root> = () => (tree, file) => {
  const fm = extractFrontmatter(file.data);
  if (fm === null) return;

  const { title, description } = fm;
  let removedAny = false;

  let blockquoteIndex = 0;

  const first = tree.children[0];
  if (first !== undefined && isHeadingDepth1(first)) {
    if (title !== undefined && normalize(toString(first)) === normalize(title)) {
      tree.children.splice(0, 1);
      removedAny = true;
      // blockquoteIndex stays 0 — after splice the next node is at [0]
    } else {
      blockquoteIndex = 1;
    }
  }
  // If first node is NOT a heading, blockquoteIndex stays 0 (blockquote may be at [0])

  const candidate = tree.children[blockquoteIndex];
  if (description !== undefined && candidate !== undefined && isBlockquote(candidate)) {
    const candNorm = normalize(toString(candidate));
    const descNorm = normalize(description);

    // (a) Exact match — works for short, untruncated descriptions.
    let shouldStrip = candNorm === descNorm;

    // (b) Prefix match — handles descriptions truncated mid-word by Zod max(200).
    // Drop the (possibly partial) trailing word, then check candidate starts with that prefix.
    if (!shouldStrip) {
      const lastSpace = descNorm.lastIndexOf(" ");
      const descPrefix = lastSpace > 30 ? descNorm.slice(0, lastSpace) : descNorm;
      if (descPrefix.length >= 30 && candNorm.startsWith(descPrefix)) {
        shouldStrip = true;
      }
    }

    if (shouldStrip) {
      tree.children.splice(blockquoteIndex, 1);
      removedAny = true;
    }
  }

  // If we stripped any duplicate, also drop a leading thematic break (`---` → <hr>)
  // that was acting as a separator between the duplicate header and the body.
  if (removedAny) {
    const next = tree.children[0];
    if (next !== undefined && next.type === "thematicBreak") {
      tree.children.splice(0, 1);
    }
  }
};

export default remarkStripFrontmatterDuplicates;
