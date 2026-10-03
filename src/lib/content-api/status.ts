import type { ArticleStatus } from "./contract";
import type { Publication } from "./service";

export type StatusInput = Readonly<{
  version: number;
  publishedVersion: number | null;
  unpublishedAt: Date | null;
  /** Only the newest publication matters: `content_publications_one_active_idx` and `requireIdle` keep an active one last. */
  latestPublication: Readonly<{ state: Publication["state"] }> | null;
}>;

/** The one rule for an article's status; first match wins. Pure: no database. */
export const articleStatus = (a: StatusInput): ArticleStatus => {
  const state = a.latestPublication?.state;
  if (state === "queued" || state === "publishing") return "publishing";
  if (state === "failed") return "failed";
  if (a.unpublishedAt) return "unpublished";
  if (a.publishedVersion === null) return "draft";
  if (a.version > a.publishedVersion) return "changed";
  return "published";
};
