import { Octokit } from "@octokit/rest";
import { hash } from "./auth";
import { apiError } from "./errors";

export const articlePath = (slug: string, lang: string): string =>
  `src/content/posts/${lang === "en" ? "en/" : ""}${slug}.md`;
export const articleUrl = (slug: string, lang: string): string => {
  const site = new URL(process.env.SITE_URL ?? "https://artka.dev");
  return new URL(`${lang === "en" ? "/en" : ""}/blog/${slug}/`, site).href;
};
/**
 * A fetch that gives up after `ms`. @octokit/request ignores `request.timeout`
 * (it only forwards `request.signal`), and these calls run while the worker
 * holds the content lock inside a transaction: without a deadline of their own
 * a stalled GitHub response would hold that lock for minutes.
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
const GITHUB_REQUEST_DEADLINE_MS = 10_000;
const github = () => {
  const { GITHUB_PAT: token, GITHUB_REPO_OWNER: owner, GITHUB_REPO_NAME: repo } = process.env;
  if (!token || !owner || !repo)
    throw apiError(503, "publisher_not_configured", "GitHub publishing is not configured.");
  return {
    client: new Octokit({
      auth: token,
      request: { fetch: fetchWithDeadline(GITHUB_REQUEST_DEADLINE_MS) },
    }),
    owner,
    repo,
    branch: process.env.GITHUB_DEFAULT_BRANCH ?? "main",
  };
};
export const readRemoteArticle = async (path: string) => {
  const { client, owner, repo, branch } = github();
  try {
    const { data } = await client.repos.getContent({ owner, repo, path, ref: branch });
    if (Array.isArray(data) || !("content" in data))
      throw apiError(409, "path_conflict", "Article path is not a file.");
    const content = Buffer.from(data.content, "base64").toString("utf8");
    return { content, hash: hash(content) };
  } catch (error) {
    if ((error as { status?: number }).status === 404) return { content: null, hash: null };
    throw error;
  }
};

const REVISION_LINE = /^apiRevision:\s*["']?([0-9a-fA-F-]{36})["']?\s*$/m;
/** The `apiRevision` marker the API wrote into the frontmatter; survives prettier reformatting. */
export const fileApiRevision = (file: string): string | null => {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(file)?.[1];
  return (frontmatter && REVISION_LINE.exec(frontmatter)?.[1]?.toLowerCase()) || null;
};

type Github = ReturnType<typeof github>;
type TreeEntry = Readonly<{
  path: string;
  mode: "100644";
  type: "blob";
  sha: string | null;
}>;
type Ownership = Readonly<{ overwrite: boolean; ownedRevisions?: readonly string[] }>;

const readAtParent = async (
  { client, owner, repo }: Github,
  parent: string,
  target: string,
): Promise<string | null> => {
  try {
    const { data } = await client.repos.getContent({ owner, repo, path: target, ref: parent });
    if (Array.isArray(data) || !("content" in data))
      throw apiError(409, "path_conflict", "Article path is not a file.");
    return Buffer.from(data.content, "base64").toString("utf8");
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null;
    throw error;
  }
};
/** The file at `path` plus its MDX twin; an MDX article owns the address and is never touched. */
const readArticleAtParent = async (g: Github, parent: string, path: string) => {
  const [current, mdx] = await Promise.all([
    readAtParent(g, parent, path),
    readAtParent(g, parent, `${path}x`),
  ]);
  if (mdx !== null)
    throw apiError(409, "slug_conflict", "An MDX article already owns this address.");
  return current;
};
const mayChange = (current: string, { overwrite, ownedRevisions = [] }: Ownership): boolean => {
  const revision = fileApiRevision(current);
  return overwrite || (revision !== null && ownedRevisions.includes(revision));
};
/**
 * Commit one tree entry on top of `parent` and advance the branch without force. Returns null when
 * the branch moved (409/422) and another attempt is allowed; any other failure, and the last
 * attempt's, is thrown.
 */
const pushEntry = async (
  g: Github,
  parent: string,
  entry: TreeEntry,
  message: string,
  lastAttempt: boolean,
): Promise<string | null> => {
  const { client, owner, repo, branch } = g;
  const { data: parentCommit } = await client.git.getCommit({ owner, repo, commit_sha: parent });
  const { data: tree } = await client.git.createTree({
    owner,
    repo,
    base_tree: parentCommit.tree.sha,
    tree: [entry],
  });
  const { data: commit } = await client.git.createCommit({
    owner,
    repo,
    message,
    tree: tree.sha,
    parents: [parent],
  });
  try {
    await client.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: commit.sha,
      force: false,
    });
    return commit.sha;
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (lastAttempt || (status !== 409 && status !== 422)) throw error;
    return null;
  }
};

// Read the file at an immutable parent, then advance the branch without force. A concurrent
// push moves the parent and forces a fresh read before the retry.
//
// There is no stored baseline: the API is the single writer of the articles it owns, so with
// `overwrite` the file is replaced whatever it holds (prettier may have reformatted it since the
// last publication). Without `overwrite` (the article has never been committed) a file that
// already sits at the path belongs to someone else and is not touched, unless its `apiRevision`
// is one of `ownedRevisions` (ids of this article's own publications): then it is our own commit
// whose response was lost before the database recorded it.
// TODO(cutover): the `overwrite` guard exists only while legacy file posts live in git; it goes
// away with commitArticle in stage 2 (docs/superpowers/plans/2026-10-03-api-only-migration.md).
export const commitArticle = async (
  path: string,
  content: string,
  ownership: Ownership,
): Promise<string> => {
  const g = github();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: ref } = await g.client.git.getRef({
      owner: g.owner,
      repo: g.repo,
      ref: `heads/${g.branch}`,
    });
    const parent = ref.object.sha;
    const current = await readArticleAtParent(g, parent, path);
    if (current === content) return parent; // Recovery after GitHub accepted a previous attempt.
    if (current !== null && !mayChange(current, ownership))
      throw apiError(409, "slug_conflict", "An existing site article owns this slug.");
    const { data: blob } = await g.client.git.createBlob({
      owner: g.owner,
      repo: g.repo,
      content,
      encoding: "utf-8",
    });
    const sha = await pushEntry(
      g,
      parent,
      { path, mode: "100644", type: "blob", sha: blob.sha },
      `content: publish ${path}`,
      attempt === 2,
    );
    if (sha !== null) return sha;
  }
  // Unreachable: the last attempt rethrows the original error. Kept only for the return type;
  // it goes away with commitArticle in stage 2.
  throw apiError(409, "branch_busy", "The publication branch is changing; retry later.");
};

/**
 * Remove the article's file in one commit, with the same ownership, no-force and retry rules as
 * `commitArticle`. A file that is already gone is a recovery after a lost response: the parent is
 * returned and nothing is committed.
 */
export const deleteArticle = async (path: string, ownership: Ownership): Promise<string> => {
  const g = github();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: ref } = await g.client.git.getRef({
      owner: g.owner,
      repo: g.repo,
      ref: `heads/${g.branch}`,
    });
    const parent = ref.object.sha;
    const current = await readArticleAtParent(g, parent, path);
    if (current === null) return parent;
    if (!mayChange(current, ownership))
      throw apiError(409, "slug_conflict", "An existing site article owns this slug.");
    const sha = await pushEntry(
      g,
      parent,
      { path, mode: "100644", type: "blob", sha: null },
      `content: unpublish ${path}`,
      attempt === 2,
    );
    if (sha !== null) return sha;
  }
  throw apiError(409, "branch_busy", "The publication branch is changing; retry later.");
};
