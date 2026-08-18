import { describe, expect, it } from "vitest";
import {
  fetchWithTimeout,
  startProductionServer,
  stopServer,
  waitForOutput,
} from "./production-server.helpers";

const responseFor = async (
  origin: string,
  pathname: string,
  init: RequestInit = {},
): Promise<Response> =>
  await fetchWithTimeout(origin + pathname, {
    ...init,
    redirect: "manual",
  });

const status = async (origin: string, pathname: string, headers?: HeadersInit): Promise<number> => {
  const response = await responseFor(origin, pathname, { headers });
  await response.body?.cancel();
  return response.status;
};

const redirect = async (
  origin: string,
  pathname: string,
  init: RequestInit = {},
): Promise<{ readonly status: number; readonly location: string | null }> => {
  const response = await responseFor(origin, pathname, init);
  await response.body?.cancel();
  return { status: response.status, location: response.headers.get("location") };
};

const html = async (origin: string, pathname: string): Promise<string> => {
  const response = await responseFor(origin, pathname);
  const body = await response.text();
  expect(response.status, pathname + "\n" + body.slice(0, 1_000)).toBe(200);
  return body;
};

const expectCanonicalHomeLinks = (
  body: string,
  expected: { readonly blog: string; readonly course: string },
): void => {
  expect(body).toContain('href="' + expected.blog + '" class="masthead__cta"');
  expect(body).toContain('href="' + expected.course + '" class="course-band__cta"');
  const homePosts = [...body.matchAll(/<a\b[^>]*>/g)]
    .filter(([tag]) => /\bclass="[^"]*\b(featured__link|post-card__link)\b/.test(tag))
    .map(([tag]) => tag.match(/\bhref="([^"]+)"/)?.[1]);
  expect(homePosts).toHaveLength(4);
  expect(homePosts.every((href) => href?.startsWith(expected.blog) && href.endsWith("/"))).toBe(
    true,
  );
};

describe("production standalone server", () => {
  it("serves public SEO routes and records unresolved adapter file-variant diagnostics", async () => {
    const server = await startProductionServer({
      host: "127.0.0.1",
      siteUrl: "https://artka.dev",
      auth: "unconfigured",
    });

    try {
      const ruHome = await html(server.origin, "/");
      const enHome = await html(server.origin, "/en/");

      for (const pathname of ["/blog/", "/en/blog/"]) {
        expect(await status(server.origin, pathname), pathname + "\n" + server.output()).toBe(200);
      }

      expect(await redirect(server.origin, "/blog")).toEqual({ status: 301, location: "/blog/" });
      expect(await redirect(server.origin, "/blog/02-context-and-cache")).toEqual({
        status: 301,
        location: "/blog/02-context-and-cache/",
      });
      expect(await redirect(server.origin, "/blog/02-context-and-cache/")).toEqual({
        status: 301,
        location: "/courses/claude-code-guide/02-context-and-cache/",
      });

      for (const pathname of ["/robots.txt", "/rss.xml", "/sitemap-index.xml", "/llms-full.txt"]) {
        expect(await status(server.origin, pathname), pathname).toBe(200);
      }

      const fileVariantResults = await Promise.all(
        (
          [
            ["/llms-full.txt/", "/llms-full.txt"],
            ["/rss.xml/", "/rss.xml"],
            ["/feed.json/", "/feed.json"],
            ["/sitemap-index.xml/", "/sitemap-index.xml"],
            ["/sitemap-ru.xml/", "/sitemap-ru.xml"],
          ] as const
        ).map(async ([variant, canonical]) => ({
          variant,
          canonical,
          get: await redirect(server.origin, variant),
          head: await redirect(server.origin, variant, { method: "HEAD" }),
        })),
      );

      // Astro's standalone static handler runs before repository middleware. Until the edge
      // canonicalizes these variants, preserve exact diagnostics rather than claiming a redirect
      // contract that this adapter cannot provide without a custom server.
      expect(fileVariantResults).toEqual(
        [
          ["/llms-full.txt/", "/llms-full.txt", 200],
          ["/rss.xml/", "/rss.xml", 500],
          ["/feed.json/", "/feed.json", 500],
          ["/sitemap-index.xml/", "/sitemap-index.xml", 500],
          ["/sitemap-ru.xml/", "/sitemap-ru.xml", 500],
        ].map(([variant, canonical, adapterStatus]) => ({
          variant,
          canonical,
          get: { status: adapterStatus, location: null },
          head: { status: adapterStatus, location: null },
        })),
      );

      expectCanonicalHomeLinks(ruHome, {
        blog: "/blog/",
        course: "/courses/claude-code-guide/",
      });
      expectCanonicalHomeLinks(enHome, {
        blog: "/en/blog/",
        course: "/en/courses/claude-code-guide/",
      });

      expect(await status(server.origin, "/privacy/")).toBe(404);
      expect(
        await redirect(server.origin, "/llms-full.txt?x=1", {
          headers: { "x-forwarded-host": "www.artka.dev" },
        }),
      ).toEqual({ status: 301, location: "https://artka.dev/llms-full.txt?x=1" });
      expect(
        await redirect(server.origin, "/llms-full.txt", {
          headers: { "x-forwarded-host": "evil.test" },
        }),
      ).toEqual({ status: 200, location: null });

      expect(await status(server.origin, "/api/auth/get-session/")).toBe(500);
      await waitForOutput(server.output, "BETTER_AUTH_SECRET is required", 1_000);
    } finally {
      await stopServer(server.child);
    }
  });

  it("delivers canonical POST requests to endpoints without slash-normalization redirects", async () => {
    const server = await startProductionServer({
      host: "127.0.0.1",
      siteUrl: "https://artka.dev",
      auth: "test",
    });

    try {
      const check = await responseFor(server.origin, "/api/check/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      });
      expect(check.status).toBe(400);
      expect(check.headers.get("location")).toBeNull();
      await expect(check.json()).resolves.toMatchObject({ pass: false, feedback: "Bad JSON." });

      for (const pathname of [
        "/api/auth/sign-in/email/",
        "/api/auth/sign-in/social/",
        "/api/auth/sign-out/",
      ]) {
        const response = await responseFor(server.origin, pathname, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{",
        });
        expect([301, 302, 307, 308], pathname + "\n" + server.output()).not.toContain(
          response.status,
        );
        expect(response.headers.get("location"), pathname).toBeNull();
        await response.body?.cancel();
      }

      expect(
        await redirect(server.origin, "/api/check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{",
        }),
      ).toEqual({ status: 301, location: "/api/check/" });
    } finally {
      await stopServer(server.child);
    }
  });
});
