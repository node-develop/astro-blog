import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string): string => readFileSync(join(process.cwd(), path), "utf8");

describe("repository-owned non-GET endpoint producers", () => {
  it.each([
    ["src/components/mdx/CodeChallenge.astro", 'fetch("/api/check/",'],
    ["src/pages/login.astro", 'fetch("/api/auth/sign-in/email/",'],
    ["src/pages/login.astro", 'fetch("/api/auth/sign-in/social/",'],
    ["src/components/admin/AdminHeader.astro", 'action="/api/auth/sign-out/"'],
  ])("uses the canonical slash endpoint in %s", (path, expected) => {
    expect(source(path)).toContain(expected);
  });

  it("does not retain slashless POST producers for the audited endpoints", () => {
    const combined = [
      source("src/components/mdx/CodeChallenge.astro"),
      source("src/pages/login.astro"),
      source("src/components/admin/AdminHeader.astro"),
    ].join("\n");

    expect(combined).not.toMatch(
      /(?:fetch\(["']\/api\/(?:check|auth\/sign-in\/(?:email|social))["']|action=["']\/api\/auth\/sign-out["'])/,
    );
  });
});
