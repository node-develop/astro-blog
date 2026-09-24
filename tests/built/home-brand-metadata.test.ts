import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  fetchWithTimeout,
  startProductionServer,
  stopServer,
  type StartedProductionServer,
} from "../support/production-server";

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
