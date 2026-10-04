/**
 * Editorial gates of the Content API: pure checks over an article document. They run when a
 * publication is REQUESTED (errors) and on draft saves (warnings); never in the worker.
 * Markdown is read through the same parser as `inspectMarkdown`, so code, inline code and math
 * never count as prose.
 */
import { EDITORIAL_LIMITS } from "../content/limits";
import bannedJson from "../content/banned-phrases.json" with { type: "json" };
import type { ArticleDocument } from "./contract";
import { parseArticleMarkdown } from "./markdown";

export type EditorialCode =
  | "too_short"
  | "too_few_sources"
  | "too_few_internal_links"
  | "title_duplicate"
  | "mermaid_accessibility"
  | "cover_missing"
  | "cover_placeholder"
  | "cover_width_unknown"
  | "cover_too_narrow"
  | "banned_phrase"
  | "speculative_voice";

export type EditorialFinding = Readonly<{
  code: EditorialCode;
  /** Identity of the violation, stable across edits; the ratchet compares keys. */
  key: string;
  message: string;
  context?: Readonly<Record<string, unknown>>;
}>;
/** Titles and H2 headings of the other published articles of the same language. */
export type EditorialPeers = Readonly<{ titles: readonly string[]; headings: readonly string[] }>;
type Cover = ArticleDocument["cover"];
type Node = Readonly<{ type: string; value?: string; url?: string; lang?: string | null }> & {
  children?: readonly Node[];
};

const treeOf = (body: string): Node => parseArticleMarkdown(body) as unknown as Node;
/** Every node of the tree in document order, as one flat list. */
const nodesOf = (node: Node): readonly Node[] => [node, ...(node.children ?? []).flatMap(nodesOf)];

/** NFKC, lower case, ё → е, typographic apostrophes → '. */
export const normalise = (text: string): string =>
  text.normalize("NFKC").toLowerCase().replaceAll("ё", "е").replace(/[’‘ʼ]/g, "'");

// ── Words ──────────────────────────────────────────────────────────────────

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

/** Words of the prose: text nodes only (not code, inline code, math, or image alt). */
const wordsIn = (tree: Node): number =>
  nodesOf(tree)
    .filter((node) => node.type === "text")
    .reduce((sum, node) => sum + ((node.value ?? "").match(WORD)?.length ?? 0), 0);
export const wordCountWithoutCode = (body: string): number => wordsIn(treeOf(body));

export const checkWords = (
  document: ArticleDocument,
  tree: Node = treeOf(document.body),
): readonly EditorialFinding[] => {
  const words = wordsIn(tree);
  return words >= EDITORIAL_LIMITS.minWords
    ? []
    : [
        {
          code: "too_short",
          key: "too_short",
          message: `The body has ${words} words without code; publishing needs at least ${EDITORIAL_LIMITS.minWords}.`,
          context: { words, min: EDITORIAL_LIMITS.minWords },
        },
      ];
};

export const checkSources = (document: ArticleDocument): readonly EditorialFinding[] =>
  document.sources.length >= EDITORIAL_LIMITS.minSources
    ? []
    : [
        {
          code: "too_few_sources",
          key: "too_few_sources",
          message: `The article has ${document.sources.length} sources; publishing needs at least ${EDITORIAL_LIMITS.minSources}.`,
          context: { sources: document.sources.length, min: EDITORIAL_LIMITS.minSources },
        },
      ];

// ── Internal links ─────────────────────────────────────────────────────────

const INTERNAL = /^\/(?:en\/)?(blog|courses)\/([^?#]+)/;
/** `/blog/x/`, `/en/blog/x` and `/blog/x/#a` are one link: `blog/x`. A self link is no link. */
const internalKey = (url: string, ownSlug: string): string | null => {
  const match = INTERNAL.exec(url);
  if (!match) return null;
  const rest = match[2]!.replace(/\/+$/, "");
  if (!rest) return null;
  const key = `${match[1]}/${rest}`;
  return key === `blog/${ownSlug}` ? null : key;
};

/**
 * Links to /blog/ and /courses/ (either language prefix: a translation keeps the RU links until
 * someone rewrites them) plus `relatedSlugs`, as one set of distinct targets.
 */
export const checkInternalLinks = (
  document: ArticleDocument,
  tree: Node = treeOf(document.body),
): readonly EditorialFinding[] => {
  const targets = new Set<string>([
    ...document.relatedSlugs.map((slug) => `blog/${slug}`),
    ...nodesOf(tree)
      .filter((node) => node.type === "link")
      .flatMap((node) => internalKey(node.url ?? "", document.slug) ?? []),
  ]);
  return targets.size >= EDITORIAL_LIMITS.minInternalLinks
    ? []
    : [
        {
          code: "too_few_internal_links",
          key: "too_few_internal_links",
          message: `The article links to ${targets.size} other pages of the site; publishing needs at least ${EDITORIAL_LIMITS.minInternalLinks} (body links to /blog/ or /courses/, or relatedSlugs).`,
          context: { links: targets.size, min: EDITORIAL_LIMITS.minInternalLinks },
        },
      ];
};

// ── Title ──────────────────────────────────────────────────────────────────

const NUMBERING = /^\d+(?:\.\d+)*\.?\s+/;
/** H2 headings of a body, without the `1. ` numbering. */
export const h2Headings = (body: string): readonly string[] =>
  nodesOf(treeOf(body))
    .filter((node: Node & { depth?: number }) => node.type === "heading" && node.depth === 2)
    .map((node) => textOf(node).replace(NUMBERING, "").trim());

export const checkTitle = (title: string, peers: EditorialPeers): readonly EditorialFinding[] => {
  const wanted = normalise(title).trim();
  const clash = peers.titles.some((t) => normalise(t).trim() === wanted)
    ? "title"
    : peers.headings.some((h) => normalise(h).trim() === wanted)
      ? "heading"
      : null;
  return clash
    ? [
        {
          code: "title_duplicate",
          key: "title_duplicate",
          message:
            clash === "title"
              ? "Another published article of this language has the same title."
              : "The title equals an H2 heading of another published article of this language.",
          context: { title, clash },
        },
      ]
    : [];
};

// ── Mermaid ────────────────────────────────────────────────────────────────

/** Both the `accTitle: x` and the block `accTitle { x }` forms of Mermaid. */
const hasAcc = (source: string, name: "accTitle" | "accDescr"): boolean =>
  new RegExp(`^\\s*${name}\\s*[:{]`, "m").test(source);

export const checkMermaid = (
  body: string,
  tree: Node = treeOf(body),
): readonly EditorialFinding[] =>
  nodesOf(tree)
    .filter((node) => node.type === "code" && node.lang === "mermaid")
    .flatMap((node, position): readonly EditorialFinding[] => {
      const index = position + 1;
      const source = node.value ?? "";
      const missing = (["accTitle", "accDescr"] as const).filter((name) => !hasAcc(source, name));
      return missing.length
        ? [
            {
              code: "mermaid_accessibility",
              key: `mermaid_accessibility:${source.trim().slice(0, 80)}`,
              message: `Mermaid diagram ${index} lacks ${missing.join(" and ")}.`,
              context: { diagram: index, missing },
            },
          ]
        : [];
    });

// ── Cover ──────────────────────────────────────────────────────────────────

const pathOf = (url: string): string =>
  url.startsWith("/") ? url : URL.canParse(url) ? new URL(url).pathname : url;

/**
 * `coverWidth` is the width in pixels, or null when it cannot be known (an https cover that is
 * not one of our assets).
 */
export const checkCover = (
  cover: Cover,
  coverWidth: number | null,
): readonly EditorialFinding[] => {
  if (!cover)
    return [
      {
        code: "cover_missing",
        key: "cover_missing",
        message: "Publishing needs a cover image (an uploaded asset of at least 1200 px width).",
      },
    ];
  if ("url" in cover && /^\/og-default\./i.test(pathOf(cover.url)))
    return [
      {
        code: "cover_placeholder",
        key: "cover_placeholder",
        message: "The cover is the default placeholder image; use a real one.",
      },
    ];
  if (coverWidth === null)
    return [
      {
        code: "cover_width_unknown",
        key: "cover_width_unknown",
        message: `The width of the cover cannot be checked for this URL; upload it through POST /media/ and reference it as an asset (at least ${EDITORIAL_LIMITS.minCoverWidth} px wide).`,
      },
    ];
  return coverWidth >= EDITORIAL_LIMITS.minCoverWidth
    ? []
    : [
        {
          code: "cover_too_narrow",
          key: "cover_too_narrow",
          message: `The cover is ${coverWidth} px wide; publishing needs at least ${EDITORIAL_LIMITS.minCoverWidth} px.`,
          context: { width: coverWidth, min: EDITORIAL_LIMITS.minCoverWidth },
        },
      ];
};

// ── Phrases ────────────────────────────────────────────────────────────────

type PhraseList = Readonly<{
  phrases: readonly string[];
  patterns: readonly (readonly string[])[];
}>;
type Matcher = Readonly<{ id: string; regex: RegExp }>;
const LEFT = "(?<![\\p{L}\\p{N}])";
const RIGHT = "(?![\\p{L}\\p{N}])";
const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Phrases match as whole words, any whitespace between words. A pattern is a regex source with a
 * left word boundary added; it sets its own right side. Sources are normalised like the text
 * (ё → е, apostrophes), but never lower-cased: that would break `\P{L}`-style escapes.
 */
const compile = (list: PhraseList): readonly Matcher[] => [
  ...list.phrases.map((phrase) => ({
    id: phrase,
    regex: new RegExp(
      `${LEFT}${normalise(phrase).trim().split(/\s+/).map(escapeRegex).join("\\s+")}${RIGHT}`,
      "iu",
    ),
  })),
  ...list.patterns.map(([source = ""]) => ({
    id: source,
    regex: new RegExp(
      `${LEFT}(?:${source.normalize("NFKC").replaceAll("ё", "е").replace(/[’‘ʼ]/g, "'")})`,
      "iu",
    ),
  })),
];
const bannedMatchers: Readonly<Record<"ru" | "en", readonly Matcher[]>> = {
  ru: compile(bannedJson.ru as PhraseList),
  en: compile(bannedJson.en as PhraseList),
};
// Only Russian has a list of speculative voice; an English article is not checked for it.
const speculativeMatchers: Readonly<Record<"ru" | "en", readonly Matcher[]>> = {
  ru: compile(bannedJson.speculative.ru as PhraseList),
  en: [],
};

/** Plain text of a node; inline code, math and images become a space. */
const textOf = (node: Node): string => {
  if (node.type === "text") return node.value ?? "";
  if (node.type === "inlineCode" || node.type === "inlineMath" || node.type === "image") return " ";
  if (node.type === "break") return " ";
  return (node.children ?? []).map(textOf).join("");
};
/** Prose blocks of a body: paragraphs, headings and table cells, code and math excluded. */
const proseBlocksOf = (tree: Node): readonly string[] =>
  nodesOf(tree)
    .filter((n) => n.type === "paragraph" || n.type === "heading" || n.type === "tableCell")
    .map(textOf);
export const proseBlocks = (body: string): readonly string[] => proseBlocksOf(treeOf(body));

/** Every field the reader sees, as (field, text blocks). */
const textFields = (
  document: ArticleDocument,
  tree: Node,
): readonly (readonly [string, readonly string[]])[] => [
  ["body", proseBlocksOf(tree)],
  ["title", [document.title]],
  ["description", [document.description]],
  ["summary", [document.summary]],
  ...(document.seo?.title ? [["seo.title", [document.seo.title]] as const] : []),
  ...(document.seo?.description ? [["seo.description", [document.seo.description]] as const] : []),
  ...document.faq.flatMap((item, index) => [
    [`faq[${index}].question`, [item.question]] as const,
    [`faq[${index}].answer`, [item.answer]] as const,
  ]),
];

export const checkPhrases = (
  document: ArticleDocument,
  tree: Node = treeOf(document.body),
): readonly EditorialFinding[] => {
  const kinds = [
    ["banned_phrase", bannedMatchers[document.lang], "a banned phrase"],
    ["speculative_voice", speculativeMatchers[document.lang], "speculative voice"],
  ] as const;
  return textFields(document, tree).flatMap(([field, blocks]) => {
    const texts = blocks.map(normalise);
    return kinds.flatMap(([code, matchers, label]) =>
      matchers.flatMap((matcher) => {
        const hit = texts.map((text) => matcher.regex.exec(text)?.[0]).find((m) => m !== undefined);
        return hit === undefined
          ? []
          : [
              {
                code,
                key: `${code}:${field}:${matcher.id}`,
                message: `${label} in ${field}: "${hit.trim()}". Rewrite it.`,
                context: { field, match: hit.trim() },
              } satisfies EditorialFinding,
            ];
      }),
    );
  });
};

// ── Evaluation ─────────────────────────────────────────────────────────────

export const evaluateEditorial = (
  input: Readonly<{
    document: ArticleDocument;
    coverWidth: number | null;
    peers: EditorialPeers;
  }>,
): readonly EditorialFinding[] => {
  const tree = treeOf(input.document.body); // parsed once, shared by every check
  return [
    ...checkWords(input.document, tree),
    ...checkSources(input.document),
    ...checkInternalLinks(input.document, tree),
    ...checkTitle(input.document.title, input.peers),
    ...checkMermaid(input.document.body, tree),
    ...checkCover(input.document.cover, input.coverWidth),
    ...checkPhrases(input.document, tree),
  ];
};

/**
 * The ratchet: against a live version, only findings the live version did not have are errors;
 * the rest are `carried` (warnings). No baseline (a new article, an unpublished one): all errors.
 */
export const splitByBaseline = (
  current: readonly EditorialFinding[],
  baseline: readonly EditorialFinding[] | null,
): Readonly<{ errors: readonly EditorialFinding[]; carried: readonly EditorialFinding[] }> => {
  if (baseline === null) return { errors: current, carried: [] };
  const known = new Set(baseline.map((f) => f.key));
  return {
    errors: current.filter((f) => !known.has(f.key)),
    carried: current.filter((f) => known.has(f.key)),
  };
};

/** Draft warnings stay strings: `<code>: <message>`. */
export const formatWarning = (finding: EditorialFinding): string =>
  `${finding.code}: ${finding.message}`;
