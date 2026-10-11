/**
 * Offline checks for agent-authored file drafts. No networking, execution of MDX,
 * model calls, or writes. External review records are attestations, not proof of
 * factual correctness, a successful build, or a browser inspection.
 */
import { z } from "zod";
import { visit } from "unist-util-visit";
import { postSchema } from "./content/schemas";
import { slugSchema, type ArticleDocument } from "./content-api/contract";
import { checkMermaid, checkPhrases, wordCountWithoutCode } from "./content-api/editorial";
import { canonicalJson } from "./content-api/canonical";
import { parseArticleMarkdown, safeLink } from "./content-api/markdown";
import { splitFrontmatter } from "./translate/fields";
import { contentHash, sha256 } from "./translate/hash";
import { CANONICAL_ORIGIN, canonicalPath, canonicalUrl } from "./seo/url-policy";
import { isGonePath } from "./seo/gone";

export const REVIEW_GATES = [
  "sources",
  "technical-review",
  "voice-review",
  "translation-review",
  "native-render",
  "visual-review",
  "assets-review",
] as const;
export type ReviewGate = (typeof REVIEW_GATES)[number];
export type GateStatus = "pass" | "fail" | "not-run" | "advisory";
export type BlogGate = Readonly<{
  id: string;
  status: GateStatus;
  required: boolean;
  details: readonly string[];
}>;
export type BlogFile = Readonly<{ slug: string; format: "md" | "mdx"; raw: string }>;

const claimSchema = z.strictObject({
  claim: z.string().trim().min(1),
  sourceUrl: z.url({ protocol: /^https$/ }),
  sourceTitle: z.string().trim().min(1),
  checkedAt: z.iso.date(),
  finding: z.string().trim().min(1),
  status: z.enum(["supported", "uncertain", "contradicted"]),
});
const reviewSchema = z.strictObject({
  gate: z.enum(REVIEW_GATES),
  status: z.enum(["pass", "fail", "not-run"]),
  reviewer: z.string().trim().min(1),
  details: z.string().trim().min(1),
  artifacts: z.array(z.string().trim().min(1)).default([]),
});
export const blogEvidenceSchema = z.strictObject({
  version: z.literal(1),
  articleDigest: z.string().regex(/^[a-f0-9]{64}$/),
  claims: z.array(claimSchema),
  checks: z
    .array(reviewSchema)
    .refine(
      (checks) => new Set(checks.map((check) => check.gate)).size === checks.length,
      "Each review gate may occur only once",
    ),
});
export type BlogEvidence = z.infer<typeof blogEvidenceSchema>;

export const blogDigest = (ru: BlogFile, en?: BlogFile) => {
  const ruHash = sha256(ru.raw);
  const enHash = en ? sha256(en.raw) : null;
  return {
    ruHash,
    enHash,
    articleDigest: sha256(
      canonicalJson({
        ru: { slug: ru.slug, format: ru.format, hash: ruHash },
        en: en ? { slug: en.slug, format: en.format, hash: enHash } : null,
      }),
    ),
  };
};

type PostData = z.infer<typeof postSchema>;
type ParsedPost = Readonly<{ data: PostData; body: string; file: BlogFile }>;
export type BlogWorkflowInput = Readonly<{
  ru: BlogFile;
  en?: BlogFile;
  evidence?: unknown;
  /** UTC date supplied at the CLI boundary; fixed in tests, never guessed by a model. */
  asOf: string;
  /** Repository-relative regular file lookup supplied by the CLI boundary. */
  fileExists: (path: string) => boolean;
}>;
export type BlogWorkflowReport = Readonly<{
  version: 1;
  asOf: string;
  hashes: ReturnType<typeof blogDigest>;
  urls: Readonly<{ ru: string; en: string }>;
  metrics: Readonly<{ ruProseWords: number | null; enProseWords: number | null }>;
  gates: readonly BlogGate[];
  readyForHandoff: boolean;
  publicationAuthorized: false;
  evidenceMeaning: string;
}>;

const gate = (
  id: string,
  status: GateStatus,
  details: readonly string[],
  required = true,
): BlogGate => ({ id, status, required, details });
const checked = (id: string, errors: readonly string[], success: string): BlogGate =>
  gate(id, errors.length ? "fail" : "pass", errors.length ? errors : [success]);

const parsePost = (
  file: BlogFile,
  locale: "ru" | "en",
): Readonly<{ post: ParsedPost | null; gate: BlogGate }> => {
  try {
    const parsed = splitFrontmatter(file.raw.replace(/^\uFEFF/, ""));
    const data = postSchema.strict().parse(parsed.rawData);
    const errors = [
      ...(!slugSchema.safeParse(file.slug).success ? ["Invalid lowercase, hyphenated slug"] : []),
      ...(data.lang !== locale ? [`lang must explicitly be ${locale}`] : []),
      ...(data.draft !== true ? ["Agent-workflow files must explicitly remain draft: true"] : []),
      ...(data.pubDate.toISOString().slice(0, 10) >= "2026-05-02" && !data.summary
        ? ["Posts dated 2026-05-02 or later require summary"]
        : []),
      ...(!data.tags.length || data.tags.some((tag) => !slugSchema.safeParse(tag).success)
        ? ["Use at least one locale-neutral tag slug"]
        : []),
      ...(data.updatedDate && data.updatedDate < data.pubDate
        ? ["updatedDate precedes pubDate"]
        : []),
    ];
    return {
      post: errors.length ? null : { data, body: parsed.body, file },
      gate: checked(`schema-${locale}`, errors, "Strict native post schema and draft conventions"),
    };
  } catch (error) {
    const details =
      error instanceof z.ZodError
        ? error.issues.map((issue) => `${issue.path.join(".") || "frontmatter"}: ${issue.message}`)
        : ["Cannot parse YAML frontmatter; inspect the local file for syntax errors"];
    return { post: null, gate: gate(`schema-${locale}`, "fail", details) };
  }
};

const documentOf = (post: ParsedPost, locale: "ru" | "en"): ArticleDocument => ({
  externalId: post.file.slug,
  lang: locale,
  slug: post.file.slug,
  title: post.data.title,
  description: post.data.description,
  summary: post.data.summary ?? "",
  body: post.body,
  tags: post.data.tags,
  keywords: post.data.keywords,
  faq: post.data.faq ?? [],
  sources: [],
  relatedSlugs: [],
  provenance: { agent: "offline-blog-workflow" },
  ...(post.data.seoTitle || post.data.seoDescription
    ? {
        seo: {
          ...(post.data.seoTitle ? { title: post.data.seoTitle } : {}),
          ...(post.data.seoDescription ? { description: post.data.seoDescription } : {}),
        },
      }
    : {}),
});

const contentGate = (post: ParsedPost, locale: "ru" | "en"): BlogGate => {
  const errors: string[] = [];
  if (!post.body.trim()) errors.push("Article body is empty");
  visit(parseArticleMarkdown(post.body), "heading", (node) => {
    if (node.depth === 1) errors.push("Use H2/H3 in the body; PostLayout supplies H1");
  });
  errors.push(...checkMermaid(post.body).map((finding) => finding.message));
  errors.push(...checkPhrases(documentOf(post, locale)).map((finding) => finding.message));
  return checked(`content-${locale}`, errors, "Native phrase, heading and Mermaid checks");
};

/** A safe repository-relative path; the CLI additionally refuses escaping symlinks. */
export const safeRepositoryPath = (path: string): boolean =>
  Boolean(path) &&
  !path.startsWith("/") &&
  !path.includes("\\") &&
  !path.includes("\0") &&
  path.split("/").every((part) => part !== ".." && part !== "." && part !== "");

const ownPath = (url: string): string | null => {
  if (url.startsWith("#")) return null;
  const parsed = new URL(url, CANONICAL_ORIGIN);
  return parsed.origin === CANONICAL_ORIGIN ? decodeURIComponent(parsed.pathname) : null;
};

// The API's safeLink intentionally has a narrower anchor contract. Local Astro
// headings keep Cyrillic characters; accepting them here does not change the API.
const safeWorkflowLink = (url: string): boolean =>
  safeLink(url) ||
  (() => {
    const index = url.indexOf("#");
    if (index === -1) return false;
    const base = url.slice(0, index);
    const anchor = decodeURIComponent(url.slice(index));
    return (!base || safeLink(base)) && /^#[\p{L}\p{N}\p{M}_-]+$/u.test(anchor);
  })();

const targetExists = (path: string, fileExists: BlogWorkflowInput["fileExists"]): boolean => {
  const bare = path.replace(/^\//, "").replace(/\/$/, "");
  if (!safeRepositoryPath(bare)) return path === "/" && fileExists("src/pages/index.astro");
  const match = /^(en\/)?(blog|projects)\/([a-z0-9-]+)$/.exec(bare);
  if (match) {
    const [, en = "", kind, slug] = match;
    const base = `src/content/${kind === "blog" ? "posts" : "projects"}/${en}${slug}`;
    return fileExists(`${base}.md`) || fileExists(`${base}.mdx`);
  }
  const tagMatch = /^(en\/)?tags\/([a-z0-9-]+)$/.exec(bare);
  if (tagMatch) return fileExists(`src/pages/${tagMatch[1] ?? ""}tags/[tag].astro`);
  return [
    `src/pages/${bare}.astro`,
    `src/pages/${bare}/index.astro`,
    `src/pages/${bare}.ts`,
    `public/${bare}`,
  ].some(fileExists);
};

const referenceGates = (
  posts: readonly ParsedPost[],
  fileExists: BlogWorkflowInput["fileExists"],
): readonly BlogGate[] => {
  const links: string[] = [];
  const assets: string[] = [];
  const linkErrors: string[] = [];
  const assetErrors: string[] = [];
  for (const post of posts) {
    visit(parseArticleMarkdown(post.body), (node) => {
      if (node.type === "link" || node.type === "definition") links.push(node.url);
      if (node.type === "image") {
        assets.push(node.url);
        if (!node.alt?.trim()) assetErrors.push(`Missing image alt: ${node.url}`);
      }
      if (node.type === "imageReference")
        assetErrors.push("Reference-style images require manual resolution; use inline images");
    });
    if (post.data.cover) {
      assets.push(post.data.cover);
      if (!post.data.coverAlt?.trim()) assetErrors.push("cover requires a descriptive coverAlt");
    }
    if (post.data.socialImage) {
      assets.push(post.data.socialImage);
      if (!post.data.socialImageAlt?.trim())
        assetErrors.push("socialImage requires socialImageAlt");
    }
  }
  for (const link of links) {
    try {
      if (!safeWorkflowLink(link)) {
        linkErrors.push(`Unsupported or unsafe link: ${link}`);
        continue;
      }
      const path = ownPath(link);
      if (!path) continue;
      if (isGonePath(path)) linkErrors.push(`Intentionally removed content: ${link}`);
      else if (!targetExists(canonicalPath(path), fileExists))
        linkErrors.push(`No local target for ${link}`);
    } catch {
      linkErrors.push(`Invalid URL encoding: ${link}`);
    }
  }
  for (const asset of assets) {
    try {
      if (!safeLink(asset) || asset.startsWith("#")) {
        assetErrors.push(`Unsupported or unsafe asset: ${asset}`);
        continue;
      }
      const path = ownPath(asset);
      if (path && (!safeRepositoryPath(path.slice(1)) || !fileExists(`public${path}`)))
        assetErrors.push(`Missing local asset: ${asset}`);
    } catch {
      assetErrors.push(`Invalid asset URL encoding: ${asset}`);
    }
  }
  return [
    checked(
      "internal-links",
      linkErrors,
      "Local source targets/templates exist; generated URLs and fragments need render review",
    ),
    checked(
      "local-assets",
      assetErrors,
      "Referenced local files and alt text checked; remote URLs and generated OG require assets-review",
    ),
  ];
};

const evidenceGates = (input: BlogWorkflowInput, digest: string): readonly BlogGate[] => {
  if (input.evidence === undefined)
    return REVIEW_GATES.map((id) => gate(id, "not-run", ["No review evidence supplied"]));
  const parsed = blogEvidenceSchema.safeParse(input.evidence);
  if (!parsed.success)
    return [
      gate(
        "evidence",
        "fail",
        parsed.error.issues.map((issue) => issue.message),
      ),
      ...REVIEW_GATES.map((id) => gate(id, "not-run", ["Invalid evidence record"])),
    ];
  const evidence = parsed.data;
  if (evidence.articleDigest !== digest)
    return [
      gate("evidence", "fail", ["Evidence belongs to different article bytes, slugs or formats"]),
      ...REVIEW_GATES.map((id) =>
        gate(id, "not-run", ["Stale evidence cannot approve this draft"]),
      ),
    ];
  return [
    gate("evidence", "pass", ["Review record matches the exact RU/EN artifact digest"]),
    ...REVIEW_GATES.map((id): BlogGate => {
      const review = evidence.checks.find((check) => check.gate === id);
      if (!review) return gate(id, "not-run", ["This required review was not recorded"]);
      if (review.status !== "pass") return gate(id, review.status, [review.details]);
      const errors: string[] = [];
      if (id === "sources") {
        if (!evidence.claims.length) errors.push("Sources review needs a claim/source ledger");
        if (evidence.claims.some((claim) => claim.status !== "supported"))
          errors.push("The ledger still has uncertain or contradicted claims");
        if (evidence.claims.some((claim) => claim.checkedAt > input.asOf))
          errors.push(`A claim has a checkedAt date after the review date ${input.asOf}`);
      }
      if (
        (id === "native-render" || id === "visual-review" || id === "assets-review") &&
        !review.artifacts.length
      )
        errors.push("Render, visual and asset reviews require local supporting artifacts");
      for (const artifact of review.artifacts) {
        if (!safeRepositoryPath(artifact) || !input.fileExists(artifact))
          errors.push(`Missing or unsafe supporting artifact: ${artifact}`);
      }
      return checked(id, errors, `Recorded attestation by ${review.reviewer}: ${review.details}`);
    }),
  ];
};

export const checkBlogWorkflow = (input: BlogWorkflowInput): BlogWorkflowReport => {
  const hashes = blogDigest(input.ru, input.en);
  const ru = parsePost(input.ru, "ru");
  const en = input.en ? parsePost(input.en, "en") : null;
  const parsedPosts = [ru.post, en?.post].filter((post): post is ParsedPost => Boolean(post));
  const gates: BlogGate[] = [ru.gate];
  if (!z.iso.date().safeParse(input.asOf).success)
    gates.push(gate("review-date", "fail", ["asOf must be a valid UTC YYYY-MM-DD date"]));
  if (en) gates.push(en.gate);
  else gates.push(gate("schema-en", "not-run", ["An English twin is required for handoff"]));
  if (ru.post) gates.push(contentGate(ru.post, "ru"));
  if (en?.post) gates.push(contentGate(en.post, "en"));
  if (ru.post && en?.post && input.en) {
    const translationErrors = [
      ...(input.ru.slug !== input.en.slug || input.ru.format !== input.en.format
        ? ["RU/EN twins need the same slug and extension"]
        : []),
      ...(en.post.data.sourceHash !== contentHash("posts", input.ru.raw)
        ? ["EN sourceHash differs from contentHash('posts', RU); review and synchronize the twin"]
        : []),
      ...(en.post.data.manuallyEdited !== true
        ? ["Agent-authored EN must set manuallyEdited: true to protect the reviewed translation"]
        : []),
      ...(canonicalJson(ru.post.data.tags) !== canonicalJson(en.post.data.tags)
        ? ["RU/EN tags must preserve the same locale-neutral slugs"]
        : []),
      ...(canonicalJson(ru.post.data.keywords) !== canonicalJson(en.post.data.keywords)
        ? ["RU/EN keywords must preserve the untranslated native metadata"]
        : []),
      ...(ru.post.data.author !== en.post.data.author ? ["RU/EN author identities differ"] : []),
      ...(ru.post.data.cover !== en.post.data.cover ? ["RU/EN cover URLs differ"] : []),
      ...(ru.post.data.pubDate.getTime() !== en.post.data.pubDate.getTime()
        ? ["RU/EN pubDate must identify the same publication"]
        : []),
      ...((ru.post.data.updatedDate?.getTime() ?? null) !==
      (en.post.data.updatedDate?.getTime() ?? null)
        ? ["RU/EN updatedDate must identify the same revision"]
        : []),
      ...(ru.post.data.draft !== en.post.data.draft ? ["RU/EN draft flags differ"] : []),
    ];
    gates.push(
      checked("translation", translationErrors, "Twin identity and native sourceHash match"),
    );
  } else gates.push(gate("translation", "not-run", ["Both schema-valid twins are required"]));
  gates.push(...referenceGates(parsedPosts, input.fileExists));
  gates.push(...evidenceGates(input, hashes.articleDigest));
  gates.push(
    gate(
      "language-metrics",
      "advisory",
      [
        "Unicode prose word counts are descriptive only. No validated RU readability score is implemented.",
        "English Flesch, first-person counts and AI-detection scores are not used as quality gates.",
        "MDX is inspected as text and never evaluated here; real Astro rendering is a separate required review.",
      ],
      false,
    ),
  );
  if (parsedPosts.some((post) => post.data.apiRevision))
    gates.push(
      gate(
        "api-ownership",
        "advisory",
        ["apiRevision: edits belong to the Content API; do not overwrite its generated files"],
        false,
      ),
    );
  if (parsedPosts.some((post) => !post.data.draft))
    gates.push(
      gate(
        "draft-state",
        "advisory",
        ["A file has draft:false; never stage a preview fixture as production content"],
        false,
      ),
    );
  return {
    version: 1,
    asOf: input.asOf,
    hashes,
    urls: {
      ru: canonicalUrl(`/blog/${input.ru.slug}/`),
      en: canonicalUrl(`/en/blog/${input.ru.slug}/`),
    },
    metrics: {
      ruProseWords: ru.post ? wordCountWithoutCode(ru.post.body) : null,
      enProseWords: en?.post ? wordCountWithoutCode(en.post.body) : null,
    },
    gates,
    readyForHandoff: gates.every((item) => !item.required || item.status === "pass"),
    publicationAuthorized: false,
    evidenceMeaning:
      "Local deterministic checks plus article-hash-bound reviewer attestations. A recorded pass does not independently prove facts or browser results. Ledger history and artifact contents are not cryptographically bound: re-review when research or artifacts change. No publication is performed or authorized.",
  };
};
