import { describe, expect, it } from "vitest";
import {
  applyPublicHtmlCache,
  hasSessionCookie,
  publicHtmlCacheControl,
  PUBLIC_HTML_CACHE_CONTROL,
} from "~/lib/http/public-cache";

describe("public HTML cache policy", () => {
  it("detects Better-Auth session cookies by exact name", () => {
    expect(hasSessionCookie(null)).toBe(false);
    expect(hasSessionCookie("theme=dark; better-auth.session_token=abc")).toBe(true);
    expect(hasSessionCookie("__Secure-better-auth.session_token=abc")).toBe(true);
    expect(hasSessionCookie("better-auth.session_token_lookalike=abc")).toBe(false);
  });

  it("caches anonymous requests and never signed-in ones", () => {
    const anonymous = new Request("https://artka.dev/");
    const signedIn = new Request("https://artka.dev/", {
      headers: { cookie: "better-auth.session_token=abc" },
    });
    expect(publicHtmlCacheControl(anonymous)).toBe(PUBLIC_HTML_CACHE_CONTROL);
    expect(publicHtmlCacheControl(signedIn)).toBeNull();

    const headers = new Headers();
    applyPublicHtmlCache(signedIn, headers);
    expect(headers.get("Cache-Control")).toBeNull();
    applyPublicHtmlCache(anonymous, headers);
    expect(headers.get("Cache-Control")).toBe("public, max-age=300, stale-while-revalidate=3600");
  });
});
