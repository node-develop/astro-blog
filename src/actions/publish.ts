/**
 * `publish.one` — Astro Action that pushes the locally-edited content
 * (RU + EN twin if present) to the configured GitHub repo as a single
 * commit. The downstream pipeline (Docker build → Dokploy webhook) takes
 * over from there and the change is live on artka.dev in ~2-3 minutes.
 *
 * Idempotency: before pushing, we compare the local file contents with the
 * tip of `main`. If everything matches → return `status: "no-op"` without
 * touching git. Reduces noise in commit history when an author hits Publish
 * without local changes.
 */
import { ActionError, defineAction } from "astro:actions";
import type { ActionAPIContext } from "astro:actions";
import { z } from "astro:schema";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { relative, isAbsolute } from "node:path";
import { resolveCollectionPaths, type TranslateCollection } from "~/lib/translate/site-config";
import { publishToGitHub, getRemoteFileContent } from "~/lib/git/github-publisher";
import { assertAdmin } from "./_auth";
import { isSocialEnabled } from "~/lib/social/config";
import { generateHandler as generateSocialDrafts } from "./socialDrafts.js";
import { logger as log } from "~/lib/logger";

interface RepoConfig {
  readonly token: string;
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
}

const readRepoConfig = (): RepoConfig => {
  const token = process.env.GITHUB_PAT;
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  const branch = process.env.GITHUB_DEFAULT_BRANCH ?? "main";
  if (!token || !owner || !repo) {
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: "GitHub publish env vars missing (GITHUB_PAT/OWNER/NAME)",
    });
  }
  return { token, owner, repo, branch };
};

/** Convert an absolute path to a repo-relative path with forward slashes. */
const toRepoPath = (absolute: string): string => {
  const rel = isAbsolute(absolute) ? relative(process.cwd(), absolute) : absolute;
  return rel.split(/[\\/]/).join("/");
};

const COLLECTION_LABEL: Record<TranslateCollection, string> = {
  posts: "post",
  site: "site page",
  projects: "project",
  courses: "course",
  lessons: "lesson",
};

export type PublishOneInput = {
  collection: "posts" | "site" | "projects" | "courses" | "lessons";
  slug: string;
  message?: string | undefined;
};

export type PublishOneResult =
  | { ok: true; status: "no-op"; reason: string; files: ReadonlyArray<string> }
  | { ok: true; status: "published"; commitSha: string; commitUrl: string; files: string[] };

/** Plain function — callable in tests without Astro runtime. */
export const publishOneHandler = async (
  input: PublishOneInput,
  context: ActionAPIContext,
): Promise<PublishOneResult> => {
  assertAdmin(context.locals.user as { role?: string | null } | null);
  const repo = readRepoConfig();
  log.info(
    { slug: input.slug, collection: input.collection, socialEnabled: isSocialEnabled() },
    "publish.one start",
  );

  const { ruPath, enPath } = resolveCollectionPaths(input.collection, input.slug);
  const candidates = [ruPath, ...(existsSync(enPath) ? [enPath] : [])];

  // Read local files; bail early if RU source is missing — nothing to publish.
  if (!existsSync(ruPath)) {
    throw new ActionError({
      code: "NOT_FOUND",
      message: `RU source not found at ${ruPath}`,
    });
  }

  const fileStates = await Promise.all(
    candidates.map(async (abs) => ({
      absolutePath: abs,
      repoPath: toRepoPath(abs),
      localContent: await readFile(abs, "utf8"),
    })),
  );

  // Idempotency: compare local content with remote HEAD blob.
  const dirty: Array<{ path: string; content: string }> = [];
  for (const f of fileStates) {
    const remote = await getRemoteFileContent({
      token: repo.token,
      owner: repo.owner,
      repo: repo.repo,
      branch: repo.branch,
      path: f.repoPath,
    });
    if (remote !== f.localContent) {
      dirty.push({ path: f.repoPath, content: f.localContent });
    }
  }

  if (dirty.length === 0) {
    log.info(
      { slug: input.slug, collection: input.collection },
      "publish.one no-op (content matches main)",
    );
    if (isSocialEnabled() && input.collection === "posts") {
      try {
        const r = await generateSocialDrafts({ slug: input.slug, collection: "posts" }, context);
        log.info({ slug: input.slug, result: r }, "social kickoff (no-op git path)");
      } catch (err) {
        log.warn({ mod: "social", slug: input.slug, err }, "generate kickoff failed (no-op path)");
      }
    }
    return {
      ok: true as const,
      status: "no-op" as const,
      reason: "Local files match the remote branch already",
      files: [] as ReadonlyArray<string>,
    };
  }

  const message =
    input.message ??
    `content(${input.collection}): publish ${COLLECTION_LABEL[input.collection]} \`${input.slug}\``;

  try {
    const result = await publishToGitHub({
      token: repo.token,
      owner: repo.owner,
      repo: repo.repo,
      branch: repo.branch,
      message,
      files: dirty.map((f) => ({ path: f.path, content: f.content })),
    });

    // Best-effort hook: kick off social draft generation. Do not fail the
    // publish if generation kickoff errors — admin can re-trigger from /admin/social.
    if (isSocialEnabled() && input.collection === "posts") {
      try {
        await generateSocialDrafts({ slug: input.slug, collection: "posts" }, context);
      } catch (err) {
        log.warn({ mod: "social", slug: input.slug, err }, "generate kickoff failed");
      }
    } else if (input.collection === "posts" && !isSocialEnabled()) {
      log.info({ slug: input.slug }, "social skipped: feature flag off");
    }

    return {
      ok: true as const,
      status: "published" as const,
      commitSha: result.commitSha,
      commitUrl: result.url,
      files: dirty.map((f) => f.path),
    };
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 401 || status === 403) {
      throw new ActionError({
        code: "UNAUTHORIZED",
        message: "GitHub PAT was rejected. Check GITHUB_PAT scopes (need contents:write).",
      });
    }
    throw new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: `GitHub publish failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
};

export const publish = {
  one: defineAction({
    input: z.object({
      collection: z.enum(["posts", "site", "projects", "courses", "lessons"]),
      slug: z.string().min(1).max(200),
      message: z.string().max(200).optional(),
    }),
    handler: (input, context) => publishOneHandler(input, context),
  }),
};
