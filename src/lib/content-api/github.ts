import { Octokit } from "@octokit/rest";
import { hash } from "./auth";
import { apiError } from "./errors";

export const articlePath = (slug: string, lang: string): string =>
  `src/content/posts/${lang === "en" ? "en/" : ""}${slug}.md`;
export const articleUrl = (slug: string, lang: string): string => {
  const site = new URL(process.env.SITE_URL ?? "https://artka.dev");
  return new URL(`${lang === "en" ? "/en" : ""}/blog/${slug}/`, site).href;
};
const github = () => {
  const { GITHUB_PAT: token, GITHUB_REPO_OWNER: owner, GITHUB_REPO_NAME: repo } = process.env;
  if (!token || !owner || !repo)
    throw apiError(503, "publisher_not_configured", "GitHub publishing is not configured.");
  return {
    client: new Octokit({ auth: token, request: { timeout: 10_000 } }),
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
  {
    overwrite,
    ownedRevisions = [],
  }: Readonly<{ overwrite: boolean; ownedRevisions?: readonly string[] }>,
): Promise<string> => {
  const { client, owner, repo, branch } = github();
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: ref } = await client.git.getRef({ owner, repo, ref: `heads/${branch}` });
    const parent = ref.object.sha;
    const readAtParent = async (target: string) => {
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
    const [current, mdx] = await Promise.all([readAtParent(path), readAtParent(`${path}x`)]);
    if (mdx !== null)
      throw apiError(409, "slug_conflict", "An MDX article already owns this address.");
    if (current === content) return parent; // Recovery after GitHub accepted a previous attempt.
    const revision = current === null ? null : fileApiRevision(current);
    const ownsFile = overwrite || (revision !== null && ownedRevisions.includes(revision));
    if (current !== null && !ownsFile)
      throw apiError(409, "slug_conflict", "An existing site article owns this slug.");
    const { data: parentCommit } = await client.git.getCommit({ owner, repo, commit_sha: parent });
    const { data: blob } = await client.git.createBlob({ owner, repo, content, encoding: "utf-8" });
    const { data: tree } = await client.git.createTree({
      owner,
      repo,
      base_tree: parentCommit.tree.sha,
      tree: [{ path, mode: "100644", type: "blob", sha: blob.sha }],
    });
    const { data: commit } = await client.git.createCommit({
      owner,
      repo,
      message: `content: publish ${path}`,
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
      if (attempt === 2 || (status !== 409 && status !== 422)) throw error;
    }
  }
  // Unreachable: the last attempt rethrows the original error. Kept only for the return type;
  // it goes away with commitArticle in stage 2.
  throw apiError(409, "branch_busy", "The publication branch is changing; retry later.");
};
