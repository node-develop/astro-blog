import { apiError } from "./errors";

/**
 * A fetch that gives up after `ms`. The rebuild request runs while the worker holds the content
 * lock inside a transaction: without a deadline of its own a stalled GitHub response would hold
 * that lock for minutes.
 */
export const fetchWithDeadline =
  (ms: number, fetchImpl: typeof fetch = fetch): typeof fetch =>
  (input, init) => {
    const deadline = AbortSignal.timeout(ms);
    return fetchImpl(input, {
      ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline,
    });
  };

const REBUILD_DEADLINE_MS = 10_000;

export type RebuildDeps = Readonly<{
  env?: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
}>;

/**
 * Asks GitHub to rebuild the site: `repository_dispatch` with the `content-publish` event type,
 * which `.github/workflows/docker-publish.yml` listens for. GitHub answers 204 and nothing else
 * counts as success. Every failure is transient for the worker (its backoff retries a dispatch
 * that never went out); none may become `apiError(403)`, which the worker treats as a permanent
 * `key_revoked`.
 */
export const requestRebuild = async (
  batchKey: string,
  { env = process.env, fetchImpl = fetchWithDeadline(REBUILD_DEADLINE_MS) }: RebuildDeps = {},
): Promise<void> => {
  const { GITHUB_PAT: token, GITHUB_REPO_OWNER: owner, GITHUB_REPO_NAME: repo } = env;
  if (!token || !owner || !repo)
    throw apiError(503, "publisher_not_configured", "GitHub publishing is not configured.");
  const response = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
    },
    body: JSON.stringify({ event_type: "content-publish", client_payload: { batchKey } }),
  });
  if (response.status === 204) return;
  await response.body?.cancel();
  if (response.status === 429 || response.status >= 500)
    throw apiError(503, "rebuild_unavailable", "GitHub could not accept the rebuild request.", {
      status: response.status,
    });
  throw apiError(
    502,
    "rebuild_rejected",
    "GitHub refused the rebuild request; check GITHUB_PAT (Contents: write) and the repository.",
    { status: response.status },
  );
};
