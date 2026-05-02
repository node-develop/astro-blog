import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "src/layouts/PostLayout.astro"), "utf8");

describe("PostLayout — AuthorCard wiring", () => {
  it("imports AuthorCard from ~/components/AuthorCard.astro", () => {
    expect(src).toMatch(/import\s+AuthorCard\s+from\s+["']~\/components\/AuthorCard\.astro["']/);
  });

  it("renders <AuthorCard /> below the post body slot", () => {
    expect(src).toMatch(/<AuthorCard\s*\/?>/);
    const slotIdx = src.indexOf("<slot />");
    const cardIdx = src.indexOf("<AuthorCard");
    expect(slotIdx).toBeGreaterThan(-1);
    expect(cardIdx).toBeGreaterThan(slotIdx);
  });
});
