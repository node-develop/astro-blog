import { describe, expect, it } from "vitest";
import { allowedOrigins, isAllowedOrigin } from "~/lib/content-api/origin";

describe("allowedOrigins", () => {
  it("allows only the canonical origin in production, whatever the base URLs say", () => {
    expect(
      allowedOrigins({
        NODE_ENV: "production",
        BETTER_AUTH_URL: "http://localhost:4321",
        SITE_URL: "https://staging.example",
      }),
    ).toEqual(["https://artka.dev"]);
  });

  it("outside production adds the origin that issued the cookie, BETTER_AUTH_URL first", () => {
    expect(
      allowedOrigins({
        BETTER_AUTH_URL: "http://localhost:4321/some/path",
        SITE_URL: "https://staging.example",
      }),
    ).toEqual(["https://artka.dev", "http://localhost:4321"]);
    expect(allowedOrigins({ SITE_URL: "https://staging.example" })).toEqual([
      "https://artka.dev",
      "https://staging.example",
    ]);
  });

  it("does not throw when no base URL is configured", () => {
    expect(allowedOrigins({})).toEqual(["https://artka.dev"]);
  });
});

describe("isAllowedOrigin", () => {
  const env = { NODE_ENV: "production" };
  it("rejects missing, null and foreign origins; accepts the canonical one", () => {
    expect(isAllowedOrigin(null, env)).toBe(false);
    expect(isAllowedOrigin("null", env)).toBe(false);
    expect(isAllowedOrigin("https://evil.test", env)).toBe(false);
    expect(isAllowedOrigin("https://artka.dev.evil.test", env)).toBe(false);
    expect(isAllowedOrigin("https://artka.dev", env)).toBe(true);
  });
});
