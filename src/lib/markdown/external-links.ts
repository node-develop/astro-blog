/**
 * Structural shape of a HAST `<a>` element node passed to `rehype-external-links`'
 * `test` callback. We avoid importing from `hast` directly because `@types/hast`
 * is not a top-level dep — pnpm hoists it nested, and `tsc --noEmit` can't see
 * it from this package without an explicit entry. The structural alias below
 * carries enough surface for our test logic.
 */
interface HastAnchorLike {
  readonly properties?: Readonly<Record<string, unknown>>;
}

/**
 * SEO + safety policy for outbound links in markdown/MDX posts.
 *
 * Wired into both the `markdown` and `mdx` integrations in `astro.config.ts`
 * via `rehype-external-links`. The contract:
 *
 * - **rel**: `nofollow noopener noreferrer`
 *     - `nofollow`     — tell search engines we don't endorse the destination
 *                        for ranking purposes; preserves our own link-juice.
 *                        Source citations are referenced, not endorsed.
 *     - `noopener`     — strip `window.opener` on the new tab; prevents
 *                        tabnabbing exploits when `target="_blank"`.
 *     - `noreferrer`   — drop the `Referer` header on outbound clicks.
 *
 * - **target**: `_blank` — new tab. Authors and readers expect external
 *   citations not to navigate them away from the article.
 *
 * - **test**: returns `true` for *external* HTTP(S) URLs only. We deliberately
 *   leave alone:
 *   - relative paths (`/blog/...`, `#anchor`)
 *   - `mailto:` and `tel:` (would break the user agent's native handling)
 *   - any artka.dev URL (apex + subdomains)
 *
 * The hostname check parses the URL via the WHATWG `URL` constructor to
 * avoid false positives from substring matches (e.g. `evil.com/?u=artka.dev`).
 */
export const externalLinkPolicy = {
  target: "_blank" as const,
  rel: ["nofollow", "noopener", "noreferrer"],
  test: (node: HastAnchorLike): boolean => {
    const href = node.properties?.["href"];
    if (typeof href !== "string" || href.length === 0) return false;
    if (href.startsWith("/") || href.startsWith("#")) return false;
    if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;
    try {
      const u = new URL(href);
      if (u.protocol !== "http:" && u.protocol !== "https:") return false;
      const host = u.hostname.toLowerCase();
      if (host === "artka.dev" || host.endsWith(".artka.dev")) return false;
      return true;
    } catch {
      // Malformed URLs are not external links we want to touch — let them be.
      return false;
    }
  },
};
