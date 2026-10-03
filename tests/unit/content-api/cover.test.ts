import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

// ~/lib/fs/paths reads UPLOADS_DIR once, when it is first imported.
const uploads = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "cover-uploads-"));
  process.env.UPLOADS_DIR = dir;
  return dir;
});
import { probeImageUrl, uploadsFileExists } from "~/lib/content-api/cover";

describe("uploadsFileExists", () => {
  mkdirSync(join(uploads, "2026"), { recursive: true });
  writeFileSync(join(uploads, "2026", "a.png"), "x");
  afterAll(() => rmSync(uploads, { recursive: true, force: true }));

  it("is true for a file under the uploads directory and false for a missing one or a directory", () => {
    expect(uploadsFileExists("/uploads/2026/a.png")).toBe(true);
    expect(uploadsFileExists("/uploads/2026/missing.png")).toBe(false);
    expect(uploadsFileExists("/uploads/2026")).toBe(false);
  });
  it("never leaves the uploads directory", () => {
    expect(uploadsFileExists("/uploads/../etc/passwd")).toBe(false);
  });
});

describe("probeImageUrl", () => {
  afterEach(() => vi.unstubAllGlobals());
  const stub = (answer: (init: RequestInit) => Response) => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => answer(init));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };
  const image = () => new Response("x", { headers: { "content-type": "image/webp" } });

  it("accepts an image answer to HEAD and rejects an HTML one", async () => {
    stub(() => image());
    expect(await probeImageUrl("https://cdn.example/a.webp")).toBe(true);
    stub(() => new Response("<html>", { headers: { "content-type": "text/html" } }));
    expect(await probeImageUrl("https://cdn.example/a.webp")).toBe(false);
  });
  it("falls back to a one-byte ranged GET when HEAD is refused with 405", async () => {
    const fetchMock = stub((init) =>
      init.method === "HEAD" ? new Response(null, { status: 405 }) : image(),
    );
    expect(await probeImageUrl("https://cdn.example/a.webp")).toBe(true);
    expect(fetchMock.mock.calls.map(([, init]) => init.method ?? "GET")).toEqual(["HEAD", "GET"]);
    expect(fetchMock.mock.calls[1]![1].headers).toEqual({ range: "bytes=0-0" });
  });
  it("rejects SVG, which Rich Results do not accept as BlogPosting.image", async () => {
    stub(() => new Response("<svg/>", { headers: { "content-type": "image/svg+xml" } }));
    expect(await probeImageUrl("https://cdn.example/a.svg")).toBe(false);
  });
});
