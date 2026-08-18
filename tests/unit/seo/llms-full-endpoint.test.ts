import type { APIContext } from "astro";
import { describe, expect, it } from "vitest";
import { GET, prerender } from "../../../src/pages/llms-full.txt";

describe("llms-full.txt endpoint", () => {
  it("renders the digest as prerendered plain text from shared content", async () => {
    const response = await GET({} as APIContext);
    const body = await response.text();

    expect(prerender).toBe(true);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(body).toContain("# artka.dev — full LLM digest");
    expect(body).toContain("## Author");
    expect(body).toContain("# Posts (Russian — source of truth)");
  });
});
