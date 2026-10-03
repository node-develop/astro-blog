import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyUnpublished } from "~/lib/content-api/worker";

const url = "https://artka.dev/blog/gone/";
const other = "https://artka.dev/blog/other/";
const sitemap = (...locs: string[]) =>
  `<?xml version="1.0"?><urlset>${locs.map((l) => `<url><loc>${l}</loc></url>`).join("")}</urlset>`;
const stub = (page: number, body: string, sitemapStatus = 200) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async (target: string | URL) =>
      String(target).includes("sitemap-")
        ? new Response(body, { status: sitemapStatus })
        : new Response("", { status: page }),
    ),
  );

describe("verifyUnpublished", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("is done only when the page is 404/410 and a real sitemap no longer lists it", async () => {
    stub(404, sitemap(other));
    expect(await verifyUnpublished(url, "ru")).toBe(true);
    stub(410, sitemap(other));
    expect(await verifyUnpublished(url, "ru")).toBe(true);
  });
  it("waits while the page still answers", async () => {
    stub(200, sitemap(other));
    expect(await verifyUnpublished(url, "ru")).toBe(false);
  });
  it("waits while the sitemap still lists the url", async () => {
    stub(404, sitemap(other, url));
    expect(await verifyUnpublished(url, "ru")).toBe(false);
  });
  it.each([
    ["an empty body", ""],
    ["an HTML error page", "<html><body>Bad gateway</body></html>"],
    ["a urlset without entries", "<urlset></urlset>"],
  ])("does not take %s as proof of absence", async (_name, body) => {
    stub(404, body);
    expect(await verifyUnpublished(url, "ru")).toBe(false);
  });
  it("does not take a failing sitemap as proof of absence", async () => {
    stub(404, sitemap(other), 503);
    expect(await verifyUnpublished(url, "ru")).toBe(false);
  });
});
