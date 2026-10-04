/**
 * IndexNow (https://www.indexnow.org/documentation) — pure helpers plus the
 * one effectful entry point, `pingIndexNow`.
 *
 * Protocol recap: the site proves ownership by serving the key at
 * `https://<host>/<key>.txt` (route: src/pages/[indexnowKey].txt.ts), then
 * POSTs `{host, key, keyLocation, urlList}` to api.indexnow.org. One ping is
 * fanned out to every participating engine (Bing, Yandex, Naver, Seznam…).
 *
 * Wiring: the publish action (src/actions/publish.ts) and the content API worker
 * (src/lib/content-api/hooks.ts) call `pingIndexNow` after a successful publish. Failures are logged (pino) and never block
 * publish.
 */
import { logger } from "../logger";
import type { TranslateCollection } from "../translate/site-config";
import { CANONICAL_ORIGIN, canonicalPath, canonicalUrl } from "./url-policy";

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_MAX_URLS = 10_000;
const KEY_PATTERN = /^[A-Za-z0-9-]{8,128}$/;

export interface IndexNowPayload {
  readonly host: string;
  readonly key: string;
  readonly keyLocation: string;
  readonly urlList: ReadonlyArray<string>;
}

export const isValidIndexNowKey = (key: string | undefined | null): key is string =>
  typeof key === "string" && KEY_PATTERN.test(key);

/** Reads the key from the environment; null (not "") when unset/invalid so callers can skip cleanly. */
export const indexNowKeyFromEnv = (env: NodeJS.ProcessEnv = process.env): string | null =>
  isValidIndexNowKey(env.INDEXNOW_KEY) ? env.INDEXNOW_KEY : null;

/**
 * Normalises `urls` (canonical form, deduped, same host only) into the JSON
 * body IndexNow expects. Throws on an invalid key or an empty list — a silent
 * no-op here would look like a successful ping.
 */
export const buildIndexNowPayload = (
  urls: ReadonlyArray<string>,
  key: string,
  host: string = new URL(CANONICAL_ORIGIN).host,
): IndexNowPayload => {
  if (!isValidIndexNowKey(key)) {
    throw new Error("IndexNow key must be 8–128 chars of [A-Za-z0-9-]");
  }
  const origin = `https://${host}`;
  const urlList = Array.from(
    new Set(
      urls.map((raw) => {
        const parsed = new URL(raw, origin);
        if (parsed.host !== host) {
          throw new Error(`IndexNow URL ${raw} is not on ${host}`);
        }
        return canonicalUrl(parsed.pathname, origin);
      }),
    ),
  ).slice(0, INDEXNOW_MAX_URLS);
  if (urlList.length === 0) throw new Error("IndexNow payload needs at least one URL");
  return { host, key, keyLocation: `${origin}/${key}.txt`, urlList };
};

export interface IndexNowResult {
  readonly ok: boolean;
  readonly status: number;
  readonly submitted: number;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** POSTs the payload. Returns the HTTP status; 200/202 are success per spec. */
export const submitIndexNow = async (
  fetchImpl: FetchLike,
  payload: IndexNowPayload,
  endpoint: string = INDEXNOW_ENDPOINT,
): Promise<IndexNowResult> => {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  return {
    ok: response.status === 200 || response.status === 202,
    status: response.status,
    submitted: payload.urlList.length,
  };
};

/**
 * Public URLs affected by publishing `slug` in `collection` — the page itself
 * (RU + EN twin when present) plus the listing pages that embed it. Pure, so
 * the IndexNow ping can be unit-tested without git or network.
 */
export const publishedUrlsFor = (
  collection: TranslateCollection,
  slug: string,
  hasEnTwin: boolean,
): ReadonlyArray<string> => {
  const pair = (ru: string, en: string): string[] => (hasEnTwin ? [ru, en] : [ru]);
  const paths = ((): string[] => {
    switch (collection) {
      case "posts":
        return [...pair(`/blog/${slug}`, `/en/blog/${slug}`), "/blog", "/en/blog"];
      case "site":
        return slug === "home" ? ["/", "/en"] : pair(`/${slug}`, `/en/${slug}`);
      case "projects":
        return [...pair(`/projects/${slug}`, `/en/projects/${slug}`), "/projects", "/en/projects"];
      case "courses":
        return pair(`/courses/${slug}`, `/en/courses/${slug}`);
      case "lessons": {
        const [course, lesson] = slug.split("/");
        return [
          ...pair(`/courses/${course}/${lesson}`, `/en/courses/${course}/${lesson}`),
          `/courses/${course}`,
        ];
      }
    }
  })();
  return paths.map(canonicalPath);
};

/**
 * Best-effort IndexNow ping. The content goes live only after the CI build +
 * Dokploy deploy (~2-3 min); IndexNow is a hint that schedules a crawl, so an
 * early ping is fine. Never throws — a failed ping must not fail a publish.
 *
 * The outcome is returned so that a caller that retries (the worker hooks) can tell a ping that
 * went out (`sent`), one that was not attempted because no key is configured (`skipped`, retrying
 * cannot help) and one that failed (`failed`: network error, timeout or a non-2xx answer).
 * `publish.one` ignores it.
 */
export type IndexNowOutcome = "sent" | "skipped" | "failed";

export const pingIndexNow = async (
  collection: TranslateCollection,
  slug: string,
  hasEnTwin: boolean,
): Promise<IndexNowOutcome> => {
  const key = indexNowKeyFromEnv();
  if (!key) {
    logger.info({ slug, collection }, "indexnow skipped: INDEXNOW_KEY not set");
    return "skipped";
  }
  try {
    const payload = buildIndexNowPayload(publishedUrlsFor(collection, slug, hasEnTwin), key);
    const result = await submitIndexNow(fetch, payload);
    logger[result.ok ? "info" : "warn"]({ slug, collection, ...result }, "indexnow ping");
    return result.ok ? "sent" : "failed";
  } catch (err) {
    logger.warn({ slug, collection, err }, "indexnow ping failed");
    return "failed";
  }
};
