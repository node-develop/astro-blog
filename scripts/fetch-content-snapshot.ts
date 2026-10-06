import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { config as dotenv } from "dotenv";
import { checkSnapshot, readManifest } from "../src/lib/content/snapshot";
import { CANONICAL_ORIGIN } from "../src/lib/seo/url-policy";

/**
 * Pulls GET /api/v1/export/ into a local snapshot file (default .content/snapshot.json) that a
 * build reads through CONTENT_SNAPSHOT. The same checks as the loader run before anything is
 * written, so a bad export never replaces a good file.
 *
 * Usage: pnpm content:pull [target]. Exit codes: 0 ok, 1 cannot fetch (incl. missing token or failed validation), 2 usage.
 * The floor is content-manifest.json only; there is no override flag, lowering it is a commit.
 */

const DEFAULT_TARGET = ".content/snapshot.json";
const ATTEMPT_TIMEOUT_MS = 60_000;
/** Pauses before retries 2, 3 and 4 (4 attempts in total). */
const RETRY_DELAYS_MS: readonly number[] = [5_000, 15_000, 45_000];
const MAX_RETRY_AFTER_MS = 60_000;

export type FetchDeps = Readonly<{
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
}>;

const HINTS: Readonly<Record<number, string>> = {
  401: " (the token is wrong or revoked)",
  403: " (the key lacks the content:export scope)",
};

/**
 * Retryable: 408, 429, 5xx. A persistent 5xx (e.g. 500 export_inconsistent) therefore burns all
 * 4 attempts (~65 s) before failing loud, and a 200 with a non-JSON body (a proxy's HTML page)
 * is retried as a truncated body.
 */
const isRetryableStatus = (status: number): boolean =>
  status === 408 || status === 429 || status >= 500;

const describe = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause ? ` (${String(error.cause)})` : "";
  return `${error.message}${cause}`;
};

const retryAfterMs = (response: Response): number => {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
};

type Attempt =
  | Readonly<{ ok: true; json: unknown }>
  | Readonly<{ ok: false; error: Error; pauseMs: number; permanent: boolean }>;

/**
 * One request incl. the body. `permanent` marks a failure a retry cannot fix (4xx other than
 * 408/429); `pauseMs` carries Retry-After for 429.
 */
const attempt = async (deps: FetchDeps, url: URL, token: string): Promise<Attempt> => {
  try {
    const response = await deps.fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    });
    if (!response.ok) {
      const excerpt = (await response.text().catch(() => "")).slice(0, 300);
      return {
        ok: false,
        error: new Error(
          `GET ${url} answered ${response.status}${HINTS[response.status] ?? ""}: ${excerpt}`,
        ),
        pauseMs: response.status === 429 ? retryAfterMs(response) : 0,
        permanent: !isRetryableStatus(response.status),
      };
    }
    // A cut-off stream shows up as a SyntaxError here, or as a reject while reading the body.
    return { ok: true, json: await response.json() };
  } catch (error) {
    return {
      ok: false,
      error: new Error(`GET ${url} failed: ${describe(error)}`),
      pauseMs: 0,
      permanent: false,
    };
  }
};

/** Fetches the export with up to 4 attempts; checkSnapshot is deliberately not part of it. */
export const fetchExport = async (deps: FetchDeps, url: URL, token: string): Promise<unknown> => {
  const total = RETRY_DELAYS_MS.length + 1;
  for (let n = 1; ; n++) {
    const result = await attempt(deps, url, token);
    if (result.ok) return result.json;
    if (result.permanent) throw result.error;
    const delay = RETRY_DELAYS_MS[n - 1];
    if (delay === undefined) {
      throw new Error(`${result.error.message} (gave up after ${total} attempts)`);
    }
    deps.log(`attempt ${n + 1}/${total} after: ${result.error.message}`);
    await deps.sleep(Math.min(Math.max(result.pauseMs, delay), MAX_RETRY_AFTER_MS));
  }
};

type Args = Readonly<{ target: string } | { usage: string }>;

const parseArgs = (argv: readonly string[]): Args => {
  const rest = argv[0] === "--" ? argv.slice(1) : argv;
  const flag = rest.find((arg) => arg.startsWith("-"));
  if (flag) return { usage: `unknown option ${flag}` };
  if (rest.length > 1) return { usage: "at most one argument (the target path)" };
  return { target: resolve(rest[0] ?? DEFAULT_TARGET) };
};

const main = async (argv: readonly string[]): Promise<number> => {
  const args = parseArgs(argv);
  if ("usage" in args) {
    process.stderr.write(`usage: pnpm content:pull [target]: ${args.usage}\n`);
    return 2;
  }
  const token = process.env.CONTENT_EXPORT_TOKEN;
  if (!token) throw new Error("CONTENT_EXPORT_TOKEN is not set (scope content:export)");
  const origin = process.env.SITE_URL || CANONICAL_ORIGIN;
  const url = new URL("/api/v1/export/", origin);

  const raw = await fetchExport(
    {
      fetch,
      sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
      log: (line) => process.stderr.write(`${line}\n`),
    },
    url,
    token,
  );
  const { minArticles } = await readManifest(process.cwd());
  const snapshot = checkSnapshot(raw, minArticles, String(url));

  await mkdir(dirname(args.target), { recursive: true });
  const tmp = `${args.target}.tmp-${process.pid}`;
  try {
    await writeFile(tmp, JSON.stringify(snapshot, null, 2) + "\n");
    await rename(tmp, args.target);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
  process.stdout.write(
    `snapshotId=${snapshot.snapshotId} count=${snapshot.count} source=${url} target=${args.target}\n`,
  );
  return 0;
};

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) {
  dotenv();
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(`content:pull failed: ${describe(error)}\n`);
      process.exitCode = 1;
    },
  );
}
