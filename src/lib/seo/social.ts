/**
 * Derives a Twitter/X `@handle` from the profile URLs in `person.sameAs`.
 * Used as the fallback for `twitter:site` / `twitter:creator` when
 * `PUBLIC_TWITTER_HANDLE` is not configured, so the cards keep attribution
 * from the single source of truth (person.ts) instead of silently dropping it.
 */
const X_HOSTS: ReadonlySet<string> = new Set(["x.com", "twitter.com", "mobile.twitter.com"]);

export const twitterHandleFromSameAs = (sameAs: ReadonlyArray<string>): string | null => {
  for (const raw of sameAs) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    if (!X_HOSTS.has(url.hostname.replace(/^www\./, "").toLowerCase())) continue;
    const handle = url.pathname.split("/").filter(Boolean)[0];
    if (!handle || !/^[A-Za-z0-9_]{1,15}$/.test(handle)) continue;
    return `@${handle}`;
  }
  return null;
};
