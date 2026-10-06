import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { graphIds } from "../../src/lib/seo/nodes-global";
import { checkJsonLd } from "./jsonld";
import { disposeDists, distFrom, edit, editGraph, validFiles, type Files } from "./test-dist";

let valid: Files;
beforeAll(async () => {
  valid = await validFiles();
});
afterAll(disposeDists);

const run = async (files: Files): Promise<string> => checkJsonLd(await distFrom(files)).join("\n");

const POST = "blog/hello/index.html";
const node = (graph: Array<Record<string, unknown>>, type: string): Record<string, unknown> => {
  const found = graph.find((entry) => entry["@type"] === type);
  if (found === undefined) throw new Error(`no ${type} in the synthetic graph`);
  return found;
};

describe("checkJsonLd", () => {
  it("accepts a build whose graphs keep the contract", async () => {
    expect(await run(valid)).toBe("");
  });

  // Each row is one defect on the post page; the check must name it.
  it.each<[string, (files: Files) => Files, string]>([
    [
      "JSON that does not parse",
      (files) =>
        edit(files, POST, (html) =>
          html.replace(
            /(<script type="application\/ld\+json">)[\s\S]*?(<\/script>)/,
            '$1{"@graph": [$2',
          ),
        ),
      "does not parse",
    ],
    [
      "a BlogPosting without headline",
      (files) =>
        editGraph(files, POST, (graph) => (delete node(graph, "BlogPosting")["headline"], graph)),
      "BlogPosting.headline",
    ],
    [
      "a BlogPosting url that is not the canonical",
      (files) =>
        editGraph(files, POST, (graph) => {
          node(graph, "BlogPosting")["url"] = "https://artka.dev/blog/other/";
          return graph;
        }),
      "BlogPosting.url",
    ],
    [
      "an author that is not the Person of this graph",
      (files) =>
        editGraph(files, POST, (graph) => {
          node(graph, "BlogPosting")["author"] = { "@id": "https://artka.dev/#nobody" };
          return graph;
        }),
      "BlogPosting.author",
    ],
    [
      "a dangling isPartOf",
      (files) =>
        editGraph(files, POST, (graph) => graph.filter((entry) => entry["@type"] !== "Blog")),
      "dangling reference BlogPosting.isPartOf",
    ],
    [
      "a Person without sameAs",
      (files) => editGraph(files, POST, (graph) => (delete node(graph, "Person")["sameAs"], graph)),
      "Person.sameAs",
    ],
    [
      "an inline copy of the author next to the Person node",
      (files) =>
        editGraph(files, POST, (graph) => {
          node(graph, "BlogPosting")["author"] = { "@type": "Person", name: "Someone Else" };
          return graph;
        }),
      "exactly one Person",
    ],
    [
      "en-US on a Russian page",
      (files) =>
        editGraph(files, POST, (graph) => {
          node(graph, "BlogPosting")["inLanguage"] = "en-US";
          return graph;
        }),
      "BlogPosting.inLanguage",
    ],
    [
      "breadcrumb positions 1 and 3",
      (files) =>
        editGraph(files, POST, (graph) => {
          const items = node(graph, "BreadcrumbList")["itemListElement"] as Array<
            Record<string, unknown>
          >;
          items[1]!["position"] = 3;
          return graph;
        }),
      "positions must run 1..n",
    ],
    [
      "dateModified before datePublished",
      (files) =>
        editGraph(files, POST, (graph) => {
          node(graph, "BlogPosting")["dateModified"] = "2025-01-01T00:00:00.000Z";
          return graph;
        }),
      "earlier than datePublished",
    ],
    [
      "two Person nodes",
      (files) => editGraph(files, POST, (graph) => [...graph, { ...node(graph, "Person") }]),
      "exactly one Person",
    ],
    [
      "JSON-LD on a page whose <html lang> is not a site locale",
      (files) => edit(files, POST, (html) => html.replace('<html lang="ru">', '<html lang="fr">')),
      "not a site locale",
    ],
  ])("rejects %s", async (_name, mutate, expected) => {
    expect(await run(mutate(valid))).toContain(expected);
  });

  // The one allowed dangling reference is a site-global node of the OTHER locale, judged per page.
  it("applies each page's own locale to the cross-locale exception", async () => {
    const reference = (graph: Array<Record<string, unknown>>) => [
      ...graph,
      {
        "@type": "WebPage",
        "@id": "https://artka.dev/x/#webpage",
        isPartOf: { "@id": graphIds.blogEn },
      },
    ];
    expect(await run(editGraph(valid, "about/index.html", reference))).toBe("");
    expect(await run(editGraph(valid, "en/about/index.html", reference))).toContain(
      `WebPage.isPartOf -> ${graphIds.blogEn}`,
    );
  });

  it("reads every JSON-LD block of a page as one graph", async () => {
    const second = (id: string) =>
      `<script type="application/ld+json">${JSON.stringify({
        "@type": "WebPage",
        "@id": "https://artka.dev/second/#webpage",
        about: { "@id": id },
      })}</script>`;
    const withBlock = (id: string) =>
      edit(valid, "about/index.html", (html) => html.replace("</head>", `${second(id)}</head>`));
    expect(await run(withBlock(graphIds.person))).toBe("");
    expect(await run(withBlock("https://artka.dev/#nobody"))).toContain(
      "dangling reference WebPage.about -> https://artka.dev/#nobody",
    );
  });

  it("is silent about a page without JSON-LD next to pages that have it", async () => {
    const files = edit(valid, "about/index.html", (html) =>
      html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, ""),
    );
    expect(await run(files)).toBe("");
  });

  it("refuses to pass a build in which no page has JSON-LD", async () => {
    const stripped = Object.fromEntries(
      Object.entries(valid).map(([name, content]) => [
        name,
        typeof content === "string"
          ? content.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, "")
          : content,
      ]),
    );
    expect(await run(stripped)).toContain("nothing was checked");
  });

  it("refuses to pass an empty build", async () => {
    expect(await run({ "robots.txt": "User-agent: *" })).toContain("nothing was checked");
  });
});
