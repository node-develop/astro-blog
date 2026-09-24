import { describe, expect, it } from "vitest";
import { canonicalHostRedirect, requiresAuthContext } from "~/lib/auth/request-classification";

const request = (
  pathname: string,
  init: { readonly method?: string; readonly headers?: HeadersInit } = {},
): Request =>
  new Request(new URL(pathname, "http://origin.test"), {
    ...(init.method === undefined ? {} : { method: init.method }),
    ...(init.headers === undefined ? {} : { headers: init.headers }),
  });

describe("requiresAuthContext", () => {
  it.each(["/", "/blog/", "/en/", "/en/blog/", "/sitemap-index.xml"])(
    "skips auth for anonymous public GET %s",
    (pathname) => expect(requiresAuthContext(request(pathname), pathname)).toBe(false),
  );

  it("skips auth for an anonymous public HEAD request", () => {
    expect(requiresAuthContext(request("/blog/", { method: "HEAD" }), "/blog/")).toBe(false);
  });

  it.each(["/admin/", "/admin/posts/", "/login/", "/api/auth/get-session"])(
    "requires auth context for %s",
    (pathname) => expect(requiresAuthContext(request(pathname), pathname)).toBe(true),
  );

  // Cookie-name matching itself is covered in src/lib/http/session-cookie.test.ts.
  it("requires auth for a public GET that carries a session cookie", () => {
    const cookie = "theme=dark; better-auth.session_token=abc; locale=en";
    expect(requiresAuthContext(request("/", { headers: { cookie } }), "/")).toBe(true);
    expect(requiresAuthContext(request("/", { headers: { cookie: "theme=dark" } }), "/")).toBe(
      false,
    );
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "requires auth for a non-idempotent %s request",
    (method) => {
      expect(requiresAuthContext(request("/contact/", { method }), "/contact/")).toBe(true);
    },
  );

  it("requires auth for an Astro action request", () => {
    const pathname = "/_actions/save";
    expect(requiresAuthContext(request(pathname), pathname)).toBe(true);
  });
});

describe("canonicalHostRedirect", () => {
  it("redirects the trusted forwarded www host while preserving path and query", () => {
    expect(
      canonicalHostRedirect(
        request("/blog/?q=1", { headers: { "x-forwarded-host": "www.artka.dev" } }),
      )?.toString(),
    ).toBe("https://artka.dev/blog/?q=1");
  });

  it.each(["WWW.ARTKA.DEV", "www.artka.dev:443", "WWW.ARTKA.DEV:8443"])(
    "accepts case-insensitive trusted www with an optional port: %s",
    (host) => {
      expect(canonicalHostRedirect(request("/about/?x=1", { headers: { host } }))?.toString()).toBe(
        "https://artka.dev/about/?x=1",
      );
    },
  );

  it("uses only the first valid forwarded host value", () => {
    expect(
      canonicalHostRedirect(
        request("/", {
          headers: {
            host: "www.artka.dev",
            "x-forwarded-host": "evil.test, www.artka.dev",
          },
        }),
      ),
    ).toBeNull();
  });

  it("falls back to Host when the first forwarded value is invalid", () => {
    expect(
      canonicalHostRedirect(
        request("/uses/?from=test", {
          headers: {
            host: "www.artka.dev",
            "x-forwarded-host": "bad host, evil.test",
          },
        }),
      )?.toString(),
    ).toBe("https://artka.dev/uses/?from=test");
  });

  it.each(["evil.test", "www.artka.dev.evil.test", "www.artka.dev@evil.test"])(
    "never redirects an untrusted host: %s",
    (host) => {
      expect(
        canonicalHostRedirect(request("/", { headers: { "x-forwarded-host": host } })),
      ).toBeNull();
    },
  );

  it("never interprets a request path as the redirect host", () => {
    const maliciousPath = new Request("http://origin.test//evil.test/path?x=1", {
      headers: { "x-forwarded-host": "www.artka.dev" },
    });
    expect(canonicalHostRedirect(maliciousPath)?.toString()).toBe(
      "https://artka.dev//evil.test/path?x=1",
    );
  });
});
