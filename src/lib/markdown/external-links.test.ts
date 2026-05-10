import { describe, it, expect } from "vitest";
import { externalLinkPolicy } from "./external-links";

// Structural mirror of the `test` callback parameter — no hast dep needed.
interface AnchorLike {
  readonly properties?: Readonly<Record<string, unknown>>;
}

const link = (href: unknown): AnchorLike => ({ properties: { href } });

describe("externalLinkPolicy.test", () => {
  it("matches plain https external links", () => {
    expect(externalLinkPolicy.test(link("https://github.com/antirez/ds4"))).toBe(true);
    expect(externalLinkPolicy.test(link("http://example.com/foo"))).toBe(true);
  });

  it("ignores relative and anchor links", () => {
    expect(externalLinkPolicy.test(link("/blog/foo"))).toBe(false);
    expect(externalLinkPolicy.test(link("#section-3"))).toBe(false);
    expect(externalLinkPolicy.test(link(""))).toBe(false);
  });

  it("ignores artka.dev (apex and subdomain)", () => {
    expect(externalLinkPolicy.test(link("https://artka.dev/about"))).toBe(false);
    expect(externalLinkPolicy.test(link("https://blog.artka.dev/foo"))).toBe(false);
    expect(externalLinkPolicy.test(link("https://ARTKA.DEV/foo"))).toBe(false);
  });

  it("does not get fooled by artka.dev appearing in the path/query of an external host", () => {
    expect(externalLinkPolicy.test(link("https://evil.com/?u=artka.dev"))).toBe(true);
    expect(externalLinkPolicy.test(link("https://evil.com/artka.dev"))).toBe(true);
  });

  it("ignores mailto: and tel: schemes", () => {
    expect(externalLinkPolicy.test(link("mailto:dev@artka.dev"))).toBe(false);
    expect(externalLinkPolicy.test(link("tel:+71234567890"))).toBe(false);
  });

  it("ignores non-http(s) protocols", () => {
    expect(externalLinkPolicy.test(link("ftp://example.com/x"))).toBe(false);
    expect(externalLinkPolicy.test(link("javascript:alert(1)"))).toBe(false);
  });

  it("ignores malformed and missing hrefs", () => {
    expect(externalLinkPolicy.test(link("not a url"))).toBe(false);
    expect(externalLinkPolicy.test(link(undefined))).toBe(false);
    expect(externalLinkPolicy.test(link(123))).toBe(false);
  });

  it("locks down the rel + target policy", () => {
    expect(externalLinkPolicy.target).toBe("_blank");
    expect([...externalLinkPolicy.rel]).toEqual(["nofollow", "noopener", "noreferrer"]);
  });
});
