/**
 * GitHub-API publisher. Commits a list of file states straight to the
 * configured branch via the REST API — no local git, no SSH key in the
 * container, no husky pre-commit interference.
 *
 * Flow per call:
 *   1. getRef(branch)        → currentRef
 *   2. getCommit(ref.sha)    → currentTreeSha
 *   3. createBlob × N        → blob shas
 *   4. createTree(base, …)  → newTreeSha
 *   5. createCommit(message, parent, tree) → newCommitSha
 *   6. updateRef(branch, newCommitSha)
 *
 * Idempotency: caller is expected to skip the call when the working files
 * already match the remote HEAD (see `actions/publish.ts`). This module is
 * mechanical — it always tries to push.
 *
 * Errors:
 *   - 401 / 403 → caller surfaces as ActionError(UNAUTHORIZED).
 *   - 422 ref conflict (branch moved) → single retry from step 1, then bail.
 *   - Network errors → propagated; caller wraps in ActionError(INTERNAL_SERVER_ERROR).
 */
import { Octokit } from "@octokit/rest";

export interface PublishFile {
  /** Repo-relative path, e.g. `"src/content/posts/foo.md"`. */
  readonly path: string;
  /** Raw file contents (UTF-8). */
  readonly content: string;
  /** Git mode for blobs in the tree. Defaults to `100644` (regular file). */
  readonly mode?: "100644";
}

export interface PublishInput {
  readonly token: string;
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly message: string;
  readonly files: ReadonlyArray<PublishFile>;
}

export interface PublishResult {
  readonly commitSha: string;
  readonly url: string;
}

const performPush = async (params: PublishInput): Promise<PublishResult> => {
  const { token, owner, repo, branch, message, files } = params;
  const octokit = new Octokit({ auth: token });

  // 1. Resolve current branch tip.
  const ref = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` });
  const parentSha = ref.data.object.sha;

  // 2. Get parent commit's tree.
  const parentCommit = await octokit.git.getCommit({ owner, repo, commit_sha: parentSha });
  const baseTreeSha = parentCommit.data.tree.sha;

  // 3. Create a blob per file.
  const blobs = await Promise.all(
    files.map((f) =>
      octokit.git.createBlob({ owner, repo, content: f.content, encoding: "utf-8" }),
    ),
  );

  // 4. Build a new tree on top of the parent's tree.
  const tree = await octokit.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: files.map((f, i) => ({
      path: f.path,
      mode: f.mode ?? "100644",
      type: "blob",
      sha: blobs[i]!.data.sha,
    })),
  });

  // 5. Create the commit.
  const commit = await octokit.git.createCommit({
    owner,
    repo,
    message,
    tree: tree.data.sha,
    parents: [parentSha],
  });

  // 6. Move the branch ref forward.
  await octokit.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: commit.data.sha,
  });

  return {
    commitSha: commit.data.sha,
    url: `https://github.com/${owner}/${repo}/commit/${commit.data.sha}`,
  };
};

/**
 * Publish a batch of files in a single commit. Retries once on 422 conflict
 * (branch moved between getRef and updateRef — rare, but possible if a
 * concurrent push lands while we're translating).
 */
export const publishToGitHub = async (params: PublishInput): Promise<PublishResult> => {
  try {
    return await performPush(params);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 422) {
      // Reference conflict — branch advanced. Retry once with fresh state.
      return performPush(params);
    }
    throw err;
  }
};

/**
 * Read the current contents of a file at `path` on `branch`. Returns null
 * when the file doesn't exist on the remote (404). Used by the publish
 * action to short-circuit no-op publishes.
 */
export const getRemoteFileContent = async (params: {
  readonly token: string;
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly path: string;
}): Promise<string | null> => {
  const { token, owner, repo, branch, path } = params;
  const octokit = new Octokit({ auth: token });
  try {
    const res = await octokit.repos.getContent({ owner, repo, ref: branch, path });
    if (Array.isArray(res.data)) return null; // path is a directory
    if (!("content" in res.data) || typeof res.data.content !== "string") return null;
    // GitHub returns base64 with line breaks.
    return Buffer.from(res.data.content, "base64").toString("utf-8");
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) return null;
    throw err;
  }
};
