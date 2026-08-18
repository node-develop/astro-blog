import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("landing schema dependencies", () => {
  it("imports landing builders and graph types from their defining modules", async () => {
    const source = await readFile(join(process.cwd(), "src/lib/seo/landing.ts"), "utf8");

    expect(source).not.toMatch(/from\s+["']\.\/schema["']/);
    expect(source).toMatch(/from\s+["']\.\/nodes-page["']/);
    expect(source).toMatch(/from\s+["']\.\/graph-types["']/);
  });
});
