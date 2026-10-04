import { describe, expect, it } from "vitest";
import {
  checkCover,
  checkInternalLinks,
  checkMermaid,
  checkPhrases,
  checkSources,
  checkTitle,
  checkWords,
  evaluateEditorial,
  formatWarning,
  h2Headings,
  splitByBaseline,
  wordCountWithoutCode,
} from "~/lib/content-api/editorial";
import type { ArticleDocument } from "~/lib/content-api/contract";

const words = (n: number, word = "word"): string => Array.from({ length: n }, () => word).join(" ");
const doc = (overrides: Partial<ArticleDocument> = {}): ArticleDocument => ({
  externalId: "x",
  lang: "en",
  slug: "own-slug",
  title: "A unique title",
  description: "Description of the article, long enough.",
  summary: "Summary of the article that is long enough to be accepted by the schema, really.",
  body: "## Intro\n\nSome plain prose.",
  tags: ["ai"],
  keywords: [],
  sources: [{ url: "https://example.com/a", title: "A" }],
  faq: [],
  relatedSlugs: [],
  provenance: { agent: "test" },
  ...overrides,
});
const codes = (findings: readonly { code: string }[]) => findings.map((f) => f.code);

describe("wordCountWithoutCode", () => {
  it("counts prose in both scripts, hyphenated words once", () => {
    expect(wordCountWithoutCode("Привет мир, это well-known тест.")).toBe(5);
  });
  it("ignores fenced code, mermaid, inline code and math", () => {
    const body = [
      "one two",
      "",
      "```ts\nconst a = 1; " + words(50) + "\n```",
      "",
      "```mermaid\nflowchart LR\n  A --> B\n```",
      "",
      "three `inline code here` four $x + y + z$ five",
      "",
      "$$\na + b + c\n$$",
    ].join("\n");
    expect(wordCountWithoutCode(body)).toBe(5);
  });
});

describe("checkWords", () => {
  it("fails at 1199 words and passes at 1200, code not counted", () => {
    const code = "\n\n```\n" + words(500) + "\n```";
    expect(codes(checkWords(doc({ body: words(1199) + code })))).toEqual(["too_short"]);
    expect(checkWords(doc({ body: words(1200) + code }))).toEqual([]);
  });
});

describe("checkSources", () => {
  const source = (n: number) => ({ url: `https://example.com/${n}`, title: `S${n}` });
  it("needs three", () => {
    expect(codes(checkSources(doc({ sources: [source(1), source(2)] })))).toEqual([
      "too_few_sources",
    ]);
    expect(checkSources(doc({ sources: [source(1), source(2), source(3)] }))).toEqual([]);
  });
});

describe("checkInternalLinks", () => {
  it("counts distinct targets, either language prefix, anchors and slashes folded", () => {
    const body = "[a](/blog/x/) [b](/en/blog/x#part) [c](/blog/x?utm=1)";
    expect(codes(checkInternalLinks(doc({ body })))).toEqual(["too_few_internal_links"]);
    expect(checkInternalLinks(doc({ body: body + " [d](/courses/c/lesson/)" }))).toEqual([]);
    expect(checkInternalLinks(doc({ body: "[a](/en/courses/c/) [b](/en/blog/y/)" }))).toEqual([]);
  });
  it("does not count a link to itself, an external link, or the same slug in relatedSlugs", () => {
    const body = "[self](/blog/own-slug/) [ext](https://example.com/blog/z/)";
    expect(codes(checkInternalLinks(doc({ body })))).toEqual(["too_few_internal_links"]);
    expect(codes(checkInternalLinks(doc({ body: "[a](/blog/x/)", relatedSlugs: ["x"] })))).toEqual([
      "too_few_internal_links",
    ]);
  });
  it("accepts two relatedSlugs without body links", () => {
    expect(checkInternalLinks(doc({ relatedSlugs: ["a", "b"] }))).toEqual([]);
  });
});

describe("checkTitle and h2Headings", () => {
  it("rejects a title of another article, ignoring case and punctuation variants", () => {
    const peers = { titles: ["Another Title"], headings: [] };
    expect(codes(checkTitle("another title", peers))).toEqual(["title_duplicate"]);
    expect(checkTitle("A different title", peers)).toEqual([]);
  });
  it("rejects a title equal to an H2 of another article, numbering stripped", () => {
    expect(h2Headings("## 2.1. Setup guide\n\n### Not H2\n\n## Plain")).toEqual([
      "Setup guide",
      "Plain",
    ]);
    const peers = { titles: [], headings: h2Headings("## 3. Setup guide") };
    expect(codes(checkTitle("Setup guide", peers))).toEqual(["title_duplicate"]);
  });
});

describe("checkMermaid", () => {
  const block = (inner: string) => "```mermaid\n" + inner + "\n```";
  it("requires accTitle and accDescr, in colon or brace form", () => {
    expect(checkMermaid(block("flowchart LR\n  accTitle: T\n  accDescr: D\n  A --> B"))).toEqual(
      [],
    );
    expect(
      checkMermaid(block("flowchart LR\n  accTitle: T\n  accDescr {\n    long\n  }\n  A --> B")),
    ).toEqual([]);
    const missing = checkMermaid(block("flowchart LR\n  accTitle: T\n  A --> B"));
    expect(codes(missing)).toEqual(["mermaid_accessibility"]);
    expect(missing[0]!.context).toMatchObject({ missing: ["accDescr"] });
  });
  it("checks every diagram and ignores other code blocks", () => {
    const body =
      block("graph TD\n accTitle: T\n accDescr: D\n A-->B") + "\n\n" + block("graph TD\n A-->B");
    expect(checkMermaid(body)).toHaveLength(1);
    expect(checkMermaid("```ts\ngraph TD\n```")).toEqual([]);
  });
});

describe("checkCover", () => {
  const asset = { assetId: "6f1c7a52-98f0-4c3e-8f5e-3f3d6a1b2c4d", alt: "Cover" };
  it("needs a cover", () => {
    expect(codes(checkCover(undefined, null))).toEqual(["cover_missing"]);
  });
  it("rejects the placeholder, by path on a full URL too", () => {
    expect(codes(checkCover({ url: "https://artka.dev/og-default.png", alt: "x" }, 1600))).toEqual([
      "cover_placeholder",
    ]);
    expect(checkCover({ url: "https://artka.dev/images/cover.png", alt: "x" }, 1600)).toEqual([]);
  });
  it("draws the line at 1200 px", () => {
    expect(codes(checkCover(asset, 1199))).toEqual(["cover_too_narrow"]);
    expect(checkCover(asset, 1200)).toEqual([]);
  });
  it("cannot verify an unknown width and says to upload an asset", () => {
    const [finding] = checkCover({ url: "https://cdn.example.com/c.png", alt: "x" }, null);
    expect(finding!.code).toBe("cover_width_unknown");
    expect(finding!.message).toContain("POST /media/");
  });
});

describe("checkPhrases", () => {
  const ru = (body: string) => doc({ lang: "ru", body });
  it("catches Russian stamps, including stems and ё, with Unicode word boundaries", () => {
    expect(codes(checkPhrases(ru("Это про инженерию.")))).toEqual(["banned_phrase"]);
    expect(codes(checkPhrases(ru("Операция осуществляется быстро.")))).toEqual(["banned_phrase"]);
    expect(codes(checkPhrases(ru("Это даёт возможность жить.")))).toEqual(["banned_phrase"]);
    expect(codes(checkPhrases(ru("Это ПОЗВОЛЯЕТ  жить.")))).toEqual(["banned_phrase"]);
    expect(checkPhrases(ru("Контекстуально нечто. Мы уверены, что работа идёт."))).toEqual([]);
  });
  it("catches speculative voice in Russian only", () => {
    expect(codes(checkPhrases(ru("Я планирую развернуть это завтра.")))).toEqual([
      "speculative_voice",
    ]);
    expect(codes(checkPhrases(ru("Возможно я попробую.")))).toContain("speculative_voice");
    expect(checkPhrases(doc({ body: "I plan to deploy this tomorrow, maybe." }))).toEqual([]);
  });
  it("catches English stamps, with the typographic apostrophe, and not Russian ones", () => {
    expect(codes(checkPhrases(doc({ body: "It’s important to note that we delve." })))).toEqual([
      "banned_phrase",
      "banned_phrase",
    ]);
    expect(checkPhrases(doc({ body: "Это про инженерию, по сути. является." }))).toEqual([]);
  });
  it("ignores code, inline code and math", () => {
    const body = "Clean prose.\n\n```\ndelve leverage\n```\n\nAlso `delve` and $leverage$.";
    expect(checkPhrases(doc({ body }))).toEqual([]);
  });
  it("checks the other visible fields and names them", () => {
    const findings = checkPhrases(
      doc({
        title: "Let's delve",
        faq: [{ question: "Is this a game-changer?", answer: "No answer here, long enough." }],
      }),
    );
    expect(findings.map((f) => f.context?.field)).toEqual(["title", "faq[0].question"]);
  });
  it("does not match inside a longer word", () => {
    expect(checkPhrases(doc({ body: "The underscores and elevated tapestries stay." }))).toEqual(
      [],
    );
  });
});

describe("evaluateEditorial, splitByBaseline, formatWarning", () => {
  const peers = { titles: [], headings: [] };
  it("reports every failed gate at once", () => {
    const all = evaluateEditorial({ document: doc(), coverWidth: null, peers });
    expect(codes(all)).toEqual([
      "too_short",
      "too_few_sources",
      "too_few_internal_links",
      "cover_missing",
    ]);
  });
  it("splits findings the live version already had from new ones", () => {
    const current = evaluateEditorial({ document: doc(), coverWidth: null, peers });
    const baseline = current.filter((f) => f.code !== "cover_missing");
    const { errors, carried } = splitByBaseline(current, baseline);
    expect(codes(errors)).toEqual(["cover_missing"]);
    expect(codes(carried)).toEqual(["too_short", "too_few_sources", "too_few_internal_links"]);
    expect(splitByBaseline(current, null).errors).toEqual(current);
  });
  it("formats a warning as `<code>: <message>`", () => {
    const [finding] = checkCover(undefined, null);
    expect(formatWarning(finding!)).toBe(`cover_missing: ${finding!.message}`);
  });
});
