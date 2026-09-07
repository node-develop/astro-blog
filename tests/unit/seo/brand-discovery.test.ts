import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { buildLlmsFull, buildLlmsTxt, type LlmsInput } from "~/lib/agents/llms";
import { buildOrganizationNode, buildWebSiteNode } from "~/lib/seo/nodes-global";
import {
  fetchWithTimeout,
  startProductionServer,
  stopServer,
  type StartedProductionServer,
} from "../../integration/production-server.helpers";

const empty: LlmsInput = { ruPosts: [], enPosts: [], ruLessons: [], enLessons: [] };

describe("agent-facing publication identity", () => {
  it("identifies the publication, canonical homepage, author and contact in both digests", () => {
    for (const text of [buildLlmsTxt(empty), buildLlmsFull(empty).text]) {
      expect(text).toContain("Site name: artka.dev. Canonical homepage: https://artka.dev/");
      expect(text).toContain("Author: Artyom Kashuta (Артём Кашута).");
      expect(text).toContain("Editorial contact: a@artka.dev — https://artka.dev/contact/");
      expect(text).toContain("are topics covered by this publication.");
    }
  });

  it("follows llms.txt ordering and reserves H2 sections for linked file lists", () => {
    const tree = unified().use(remarkParse).parse(buildLlmsTxt(empty));
    expect(tree.children[0]).toMatchObject({ type: "heading", depth: 1 });
    expect(tree.children[1]?.type).toBe("blockquote");
    const firstSection = tree.children.findIndex(
      (node) => node.type === "heading" && node.depth === 2,
    );
    expect(firstSection).toBeGreaterThan(1);
    for (const node of tree.children.slice(firstSection)) {
      if (node.type === "heading") {
        expect(node.depth).toBe(2);
      } else {
        expect(node.type).toBe("list");
        if (node.type !== "list") continue;
        for (const item of node.children) {
          expect(item.children[0]).toMatchObject({
            type: "paragraph",
            children: expect.arrayContaining([expect.objectContaining({ type: "link" })]),
          });
        }
      }
    }
  });

  it("keeps both locales tied to the same real brand and editorial contact", () => {
    const organization = buildOrganizationNode();
    expect(organization.name).toBe("artka.dev");
    expect(organization.url).toBe("https://artka.dev/");
    expect(organization.contactPoint).toMatchObject({
      "@type": "ContactPoint",
      contactType: "editorial and technical inquiries",
      email: "a@artka.dev",
    });
    for (const locale of ["ru", "en"] as const) {
      const site = buildWebSiteNode(locale);
      expect(site.name).toBe(organization.name);
      expect(site.publisher).toEqual({ "@id": organization["@id"] });
    }
  });
});

describe("published homepage brand metadata", () => {
  let server: StartedProductionServer;
  beforeAll(async () => {
    server = await startProductionServer({
      host: "127.0.0.1",
      siteUrl: "https://artka.dev",
      auth: "unconfigured",
    });
  });
  afterAll(async () => {
    if (server) await stopServer(server.child);
  });

  it.each(["/", "/en/"])("leads with the brand in HTML metadata at %s", async (path) => {
    const response = await fetchWithTimeout(`${server.origin}${path}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toMatch(/<title>artka\.dev — Artyom Kashuta \| /);
    expect(html).toMatch(/<meta name="description" content="artka\.dev — /);
    expect(html).toMatch(/<meta property="og:title" content="artka\.dev — Artyom Kashuta/);
    expect(html).toMatch(/<meta property="og:site_name" content="artka\.dev"/);
    expect(html).toContain(`rel="canonical" href="https://artka.dev${path}"`);
    const graphs = [
      ...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
    ].flatMap((match) => JSON.parse(match[1]!)["@graph"] ?? []);
    expect(graphs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ "@type": "WebSite", name: "artka.dev" }),
        expect.objectContaining({
          "@type": "Organization",
          name: "artka.dev",
          url: "https://artka.dev/",
        }),
      ]),
    );
  });
});
