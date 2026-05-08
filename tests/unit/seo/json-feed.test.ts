import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const builder = readFileSync(join(process.cwd(), "src/lib/feeds/build-json-feed.ts"), "utf8");
const ru = readFileSync(join(process.cwd(), "src/pages/feed.json.ts"), "utf8");
const en = readFileSync(join(process.cwd(), "src/pages/en/feed.json.ts"), "utf8");

describe("JSON Feed (jsonfeed.org spec 1.1)", () => {
  it("builder declares the spec version URL exactly", () => {
    expect(builder).toMatch(/version: "https:\/\/jsonfeed\.org\/version\/1\.1"/);
  });

  it("builder emits required top-level fields", () => {
    for (const field of ["title", "home_page_url", "feed_url", "language", "authors", "items"]) {
      expect(builder).toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  it("items have required identity + content fields", () => {
    for (const field of ["id", "url", "title", "summary", "date_published", "tags", "authors"]) {
      expect(builder).toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  it("response uses the application/feed+json content-type", () => {
    expect(builder).toMatch(/application\/feed\+json/);
  });

  it.each([
    ["ru", ru, /locale: "ru"/],
    ["en", en, /locale: "en"/],
  ])("%s endpoint delegates to the shared builder", (_label, source, marker) => {
    expect(source).toMatch(/buildJsonFeed/);
    expect(source).toMatch(marker);
  });
});
