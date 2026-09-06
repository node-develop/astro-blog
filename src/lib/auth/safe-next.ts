/**
 * Validates a `next` redirect target so login flows can never bounce a
 * user to a third-party origin. Closes CVE-class issue CWE-601 / OWASP
 * A01:2021 Broken Access Control (open redirect).
 *
 * Returns a same-origin path when the input is safe, otherwise the
 * `fallback` (defaults to "/admin/", canonical under trailingSlash: "always").
 *
 * Rejects:
 *   - empty / null / non-string
 *   - absolute URLs ("https://evil.com", "//evil.com")
 *   - protocol-relative URLs ("//evil.com", "//\evil.com")
 *   - backslash-tricks browsers normalise into "//"
 *     ("/\evil.com", "/%5cevil.com", "/%5Cevil.com")
 *   - any value that doesn't parse as a same-origin path
 */
export const safeNext = (raw: string | null | undefined, fallback = "/admin/"): string => {
  if (!raw || typeof raw !== "string") return fallback;
  if (!raw.startsWith("/")) return fallback;
  // "//evil.com" → protocol-relative; browsers treat as cross-origin.
  if (raw.startsWith("//")) return fallback;
  // Backslash bypass: some browsers normalise "\" to "/" before origin parsing,
  // turning "/\evil.com" into "//evil.com".
  if (raw.startsWith("/\\")) return fallback;
  // URL-encoded backslash variant.
  if (/^\/%5[cC]/.test(raw)) return fallback;
  // Defence in depth: parse against a sentinel origin and confirm it stayed there.
  // If `raw` was a hidden cross-origin payload, URL() would resolve it elsewhere.
  try {
    const SENTINEL = "https://internal.invalid";
    const url = new URL(raw, SENTINEL);
    if (url.origin !== SENTINEL) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
};
