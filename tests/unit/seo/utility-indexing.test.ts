import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { GET as getLlmsFull } from "../../../src/pages/llms-full.txt";
import { buildWebSiteNode } from "~/lib/seo/nodes-global";

describe("utility indexing policy", () => {
  it("serves the full LLM digest with an HTTP noindex directive", async () => {
    const response = await getLlmsFull({} as APIContext);

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
  });

  it("does not advertise a search action that the site cannot execute", () => {
    const websiteNode = buildWebSiteNode("en");

    expect(websiteNode).not.toHaveProperty("potentialAction");
  });

  it("allows utility routes to be crawled for their noindex directives", () => {
    const robotsTxt = readFileSync(join(process.cwd(), "public/robots.txt"), "utf8");

    expect(robotsTxt).not.toMatch(/Disallow:\s*\/(?:en\/)?search/);
    expect(robotsTxt).not.toMatch(/Disallow:\s*\/login/);
    expect(robotsTxt).toMatch(/Disallow:\s*\/admin\//);
    expect(robotsTxt).toMatch(/Disallow:\s*\/api\//);
  });
});
