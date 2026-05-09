import type { Result } from "./errors.js";

export type RetryOpts = { maxAttempts: number; baseDelayMs: number };

const sleep = (ms: number): Promise<void> => new Promise<void>((r) => setTimeout(r, ms));

const jitter = (ms: number): number => ms / 2 + Math.random() * ms;

/**
 * Retry an async fn that returns Result<T>. Retries only `transport` errors
 * with `retryable: true` (e.g. 5xx, 429). Other errors bubble up immediately.
 *
 * Backoff: exponential (base, base*2, base*4, …) + jitter (50-150% of base).
 */
export const withRetry = async <T>(
  fn: () => Promise<Result<T>>,
  opts: RetryOpts,
): Promise<Result<T>> => {
  let last: Result<T> | null = null;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt += 1) {
    last = await fn();
    if (last.ok) return last;
    if (last.error.kind !== "transport" || !last.error.retryable) return last;
    if (attempt < opts.maxAttempts) {
      const delay = jitter(opts.baseDelayMs * 2 ** (attempt - 1));
      await sleep(delay);
    }
  }
  return last as Result<T>;
};
