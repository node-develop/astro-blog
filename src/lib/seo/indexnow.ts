/**
 * IndexNow (https://www.indexnow.org/documentation) — pure helpers.
 *
 * Protocol recap: the site proves ownership by serving the key at
 * `https://<host>/<key>.txt` (route: src/pages/[indexnowKey].txt.ts), then
 * POSTs `{host, key, keyLocation, urlList}` to api.indexnow.org. One ping is
 * fanned out to every participating engine (Bing, Yandex, Naver, Seznam…).
 *
 * Wiring: the publish action (src/actions — owned elsewhere) should call
 * `submitIndexNow(fetch, buildIndexNowPayload(urls, key, host))` after a
 * successful publish, with the canonical URLs of the RU post, its EN twin and
 * the two blog indexes. Failures must be logged (pino) and never block publish.
 */
import { CANONICAL_ORIGIN, canonicalUrl } from "./url-policy";

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
  });
  return {
    ok: response.status === 200 || response.status === 202,
    status: response.status,
    submitted: payload.urlList.length,
  };
};
