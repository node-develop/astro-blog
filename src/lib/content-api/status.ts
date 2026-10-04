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

export type PublicationEvent = Readonly<{
  kind: "publish" | "unpublish";
  state: Publication["state"];
  commitSha: string | null;
  createdAt: Date;
}>;

/**
 * Does the article's file sit in git right now? The newest of two kinds of event decides: a
 * `publish` that recorded a commit puts the file there, an `unpublish` that finished took it away.
 * Failed or queued unpublications prove nothing. Pure: no database.
 */
export const ownsCommittedFile = (publications: readonly PublicationEvent[]): boolean => {
  const events = publications.filter(
    (p) =>
      (p.kind === "publish" && p.commitSha !== null) ||
      (p.kind === "unpublish" && p.state === "published"),
  );
  const newest = events.reduce<PublicationEvent | null>(
    (best, event) =>
      best === null || event.createdAt.getTime() > best.createdAt.getTime() ? event : best,
    null,
  );
  return newest?.kind === "publish";
};

export type PointerEvent = Readonly<{
  id: string;
  kind: "publish" | "unpublish";
  state: Publication["state"];
  createdAt: Date;
}>;

/**
 * Where `content_articles.build_publication_id` goes when publication `failedId` fails: the newest
 * other publication that reached `published` decides. A `publish` is the desired state again; an
 * `unpublish` means the article was taken down, so the pointer is null (an older publish must not
 * bring a removed article back into the build). Queued, publishing and failed ones prove nothing.
 * Pure: no database.
 */
export const buildPointerAfterFailure = (
  events: readonly PointerEvent[],
  failedId: string,
): string | null => {
  const newest = events
    .filter((e) => e.id !== failedId && e.state === "published")
    .reduce<PointerEvent | null>(
      (best, e) =>
        best === null ||
        e.createdAt.getTime() > best.createdAt.getTime() ||
        (e.createdAt.getTime() === best.createdAt.getTime() && e.id > best.id)
          ? e
          : best,
      null,
    );
  return newest?.kind === "publish" ? newest.id : null;
};
