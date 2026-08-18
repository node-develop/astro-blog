import { afterEach, expect, it, vi } from "vitest";
import { CANONICAL_ORIGIN } from "~/lib/seo/url-policy";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("keeps Astro's public site identity canonical when SITE_URL points at a preview", async () => {
  vi.stubEnv("SITE_URL", "https://preview.invalid");
  vi.resetModules();

  const { default: config } = await import("../../../astro.config");

  expect(config.site).toBe(CANONICAL_ORIGIN);
});
