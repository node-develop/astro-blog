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

const visibleMainText = (body: string): string =>
  (body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const expectNegotiatedVary = (response: Response): void => {
  const tokens = (response.headers.get("vary") ?? "")
    .split(",")
    .map((token) => token.trim().toLowerCase());
  expect(tokens).toContain("accept");
  expect(tokens).toContain("accept-encoding");
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

      for (const body of [ruHome, enHome]) {
        expect(body.match(/<h1\b/gi)).toHaveLength(1);
        expect(body).toMatch(/<h2\b/i);
        expect(body).toMatch(/<h3\b/i);
        expect(visibleMainText(body).length).toBeGreaterThan(500);
        expect(body).toContain('"@type":"ContactPoint"');
        expect(body).toContain('"email":"a@artka.dev"');
      }

      for (const pathname of ["/", "/en/"]) {
        const markdown = await responseFor(server.origin, pathname, {
          headers: { Accept: "text/markdown" },
        });
        expect(markdown.status).toBe(200);
        expect(markdown.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
        expectNegotiatedVary(markdown);
        const markdownBody = await markdown.text();
        expect(markdownBody).toMatch(/^# artka\.dev/m);
        expect(markdownBody).toContain("https://artka.dev/llms.txt");
        expect(markdownBody).not.toContain("<!doctype html>");
        expect(markdownBody.length).toBeGreaterThan(500);

        const markdownHead = await responseFor(server.origin, pathname, {
          method: "HEAD",
          headers: { Accept: "text/markdown" },
        });
        expect(markdownHead.status).toBe(200);
        expect(markdownHead.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
        expectNegotiatedVary(markdownHead);
        expect(await markdownHead.text()).toBe("");

        const htmlVariant = await responseFor(server.origin, pathname, {
          headers: { Accept: "text/html" },
        });
        expect(htmlVariant.status).toBe(200);
        expect(htmlVariant.headers.get("content-type")).toContain("text/html");
        expectNegotiatedVary(htmlVariant);
        await htmlVariant.body?.cancel();

        const htmlHead = await responseFor(server.origin, pathname, {
          method: "HEAD",
          headers: { Accept: "text/html" },
        });
        expect(htmlHead.status).toBe(200);
        expect(htmlHead.headers.get("content-type")).toContain("text/html");
        expectNegotiatedVary(htmlHead);
        expect(await htmlHead.text()).toBe("");

        const weightedMarkdown = await responseFor(server.origin, pathname, {
          headers: { Accept: "text/html;q=0.3, text/markdown;q=0.9" },
        });
        expect(weightedMarkdown.status).toBe(200);
        expect(weightedMarkdown.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
        await expect(weightedMarkdown.text()).resolves.toMatch(/^# artka\.dev/m);

        const specificHtml = await responseFor(server.origin, pathname, {
          headers: { Accept: "text/*;q=0.9, text/markdown;q=0.1" },
        });
        expect(specificHtml.status).toBe(200);
        expect(specificHtml.headers.get("content-type")).toContain("text/html");
        await specificHtml.body?.cancel();

        const unacceptable = await responseFor(server.origin, pathname, {
          headers: { Accept: "application/pdf" },
        });
        expect(unacceptable.status).toBe(406);
        expect(unacceptable.headers.get("content-type")).toBe("text/plain; charset=utf-8");
        expectNegotiatedVary(unacceptable);
        await expect(unacceptable.text()).resolves.toContain("text/markdown");

        const unacceptableHead = await responseFor(server.origin, pathname, {
          method: "HEAD",
          headers: { Accept: "application/pdf" },
        });
        expect(unacceptableHead.status).toBe(406);
        expect(unacceptableHead.headers.get("content-type")).toBe("text/plain; charset=utf-8");
        expectNegotiatedVary(unacceptableHead);
        expect(await unacceptableHead.text()).toBe("");
      }

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

      // Glued lesson paths (a relative link resolved against the lesson the
      // crawler was already on). The pair below is NOT in the explicit
      // redirect table — it is recovered by the middleware rule, which is the
      // point: Search Console only ever shows a sample of the affected URLs.
      expect(
        await redirect(server.origin, "/courses/claude-code-guide/03-claude-md/06-mcp/"),
      ).toEqual({
        status: 301,
        location: "/courses/claude-code-guide/06-mcp/",
      });
      expect(
        await redirect(server.origin, "/en/courses/claude-code-guide/05-hooks/10-agent-teams/"),
      ).toEqual({
        status: 301,
        location: "/en/courses/claude-code-guide/10-agent-teams/",
      });
      // …and the real lesson it points at must answer directly, so the
      // recovery is one hop and never a chain.
      expect(await status(server.origin, "/courses/claude-code-guide/06-mcp/")).toBe(200);

      for (const pathname of [
        "/robots.txt",
        "/rss.xml",
        "/en/rss.xml",
        "/feed.json",
        "/en/feed.json",
        "/sitemap-index.xml",
        "/sitemap-ru.xml",
        "/sitemap-en.xml",
        "/llms.txt",
        "/llms-full.txt",
      ]) {
        expect(await status(server.origin, pathname), pathname).toBe(200);
      }

      const llms = await responseFor(server.origin, "/llms.txt");
      await expect(llms.text()).resolves.toContain("**When to use artka.dev**");

      const courseLanding = await html(server.origin, "/courses/claude-code-guide/");
      expect(courseLanding).toContain("Зачем этот курс");
      expect(courseLanding).toContain("Ключевые принципы");
      expect(courseLanding.indexOf('class="course__progress"')).toBeLessThan(
        courseLanding.indexOf('class="course__overview prose"'),
      );
      expect(courseLanding.indexOf('class="course__overview prose"')).toBeLessThan(
        courseLanding.indexOf('class="course__lessons"'),
      );
      const enCourseLanding = await html(server.origin, "/en/courses/claude-code-guide/");
      expect(enCourseLanding).toContain("Why this course");
      expect(enCourseLanding).toContain("Recurring principles");
      expect(enCourseLanding.indexOf('class="course__progress"')).toBeLessThan(
        enCourseLanding.indexOf('class="course__overview prose"'),
      );
      expect(enCourseLanding.indexOf('class="course__overview prose"')).toBeLessThan(
        enCourseLanding.indexOf('class="course__lessons"'),
      );

      for (const [pathname, courseUrl] of [
        ["/sitemap-ru.xml", "https://artka.dev/courses/claude-code-guide/"],
        ["/sitemap-en.xml", "https://artka.dev/en/courses/claude-code-guide/"],
      ] as const) {
        const sitemap = await responseFor(server.origin, pathname);
        expect(sitemap.status).toBe(200);
        const sitemapBody = await sitemap.text();
        const courseEntry = [...sitemapBody.matchAll(/<url>([\s\S]*?)<\/url>/g)]
          .map((match) => match[1] ?? "")
          .find((entry) => entry.includes(`<loc>${courseUrl}</loc>`));
        expect(courseEntry, pathname).toContain("<lastmod>2026-09-08</lastmod>");
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

      // Since Astro 6, endpoints whose route ends in a file extension are only served
      // without a trailing slash regardless of `trailingSlash`; the slash variant is a
      // plain 404 (no redirect). Pin that so a regression to 500 (Astro 5 behaviour)
      // or an accidental duplicate-content 200 is caught.
      expect(fileVariantResults).toEqual(
        [
          ["/llms-full.txt/", "/llms-full.txt", 404],
          ["/rss.xml/", "/rss.xml", 404],
          ["/feed.json/", "/feed.json", 404],
          ["/sitemap-index.xml/", "/sitemap-index.xml", 404],
          ["/sitemap-ru.xml/", "/sitemap-ru.xml", 404],
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

      for (const pathname of ["/contact/", "/privacy/", "/en/contact/", "/en/privacy/"]) {
        const trustPage = await html(server.origin, pathname);
        expect(visibleMainText(trustPage).length, pathname).toBeGreaterThan(500);
        expect(trustPage).toContain(`rel="canonical" href="https://artka.dev${pathname}"`);
        expect(trustPage).toContain('hreflang="ru-RU"');
        expect(trustPage).toContain('hreflang="en-US"');
      }

      const missingPath = "/__agent-readiness-missing__/";
      expect(await status(server.origin, missingPath.slice(0, -1))).toBe(404);
      const html404 = await responseFor(server.origin, missingPath, {
        headers: { Accept: "text/html" },
      });
      expect(html404.status).toBe(404);
      expect(html404.headers.get("content-type")).toContain("text/html");
      expectNegotiatedVary(html404);
      const html404Body = await html404.text();
      expect(html404Body).toContain("Страница не найдена");
      expect(html404Body).toContain('name="robots" content="noindex,follow"');

      const html404Head = await responseFor(server.origin, missingPath, {
        method: "HEAD",
        headers: { Accept: "text/html" },
      });
      expect(html404Head.status).toBe(404);
      expect(html404Head.headers.get("content-type")).toContain("text/html");
      expectNegotiatedVary(html404Head);
      expect(await html404Head.text()).toBe("");

      const markdown404 = await responseFor(server.origin, missingPath, {
        headers: { Accept: "text/markdown" },
      });
      expect(markdown404.status).toBe(404);
      expect(markdown404.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
      expectNegotiatedVary(markdown404);
      const markdown404Body = await markdown404.text();
      expect(markdown404Body).toContain("# 404 — Страница не найдена");
      expect(markdown404Body).toContain("https://artka.dev/sitemap-index.xml");
      expect(markdown404Body).toContain("https://artka.dev/llms.txt");

      const markdown404Head = await responseFor(server.origin, missingPath, {
        method: "HEAD",
        headers: { Accept: "text/markdown" },
      });
      expect(markdown404Head.status).toBe(404);
      expect(markdown404Head.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
      expectNegotiatedVary(markdown404Head);
      expect(await markdown404Head.text()).toBe("");

      const api404 = await responseFor(server.origin, "/api/__agent-readiness-missing__/", {
        headers: { Accept: "text/markdown" },
      });
      expect(api404.status).toBe(404);
      expect(api404.headers.get("content-type")).toContain("text/html");
      await api404.body?.cancel();
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

      // Better-Auth does not accept trailing slashes, but `trailingSlash: "always"`
      // forces every client to use them. The handler must strip the slash: a 404
      // here means nobody can log in (this regressed silently in production once).
      const ok = await responseFor(server.origin, "/api/auth/ok/");
      expect(ok.status, server.output()).toBe(200);
      await expect(ok.json()).resolves.toEqual({ ok: true });

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
        expect([301, 302, 307, 308, 404], pathname + "\n" + server.output()).not.toContain(
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
