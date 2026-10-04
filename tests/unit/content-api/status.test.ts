import { describe, expect, it } from "vitest";
import {
  articleStatus,
  buildPointerAfterFailure,
  ownsCommittedFile,
  type PublicationEvent,
  type StatusInput,
} from "~/lib/content-api/status";

const base: StatusInput = {
  version: 3,
  publishedVersion: 3,
  unpublishedAt: null,
  latestPublication: null,
};
const at = new Date("2026-10-01T00:00:00Z");

describe("articleStatus", () => {
  it.each<[string, Partial<StatusInput>, string]>([
    ["never published", { publishedVersion: null }, "draft"],
    ["published version is the current one", {}, "published"],
    ["edited after publishing", { publishedVersion: 2 }, "changed"],
    ["last publication finished", { latestPublication: { state: "published" } }, "published"],
    ["queued publication", { latestPublication: { state: "queued" } }, "publishing"],
    ["running publication", { latestPublication: { state: "publishing" } }, "publishing"],
    ["last publication failed", { latestPublication: { state: "failed" } }, "failed"],
    ["unpublished", { unpublishedAt: at }, "unpublished"],
    // Priorities: an active job beats everything, failed beats the stored flags.
    [
      "active job over unpublished",
      { unpublishedAt: at, latestPublication: { state: "queued" } },
      "publishing",
    ],
    [
      "active job over a draft",
      { publishedVersion: null, latestPublication: { state: "publishing" } },
      "publishing",
    ],
    [
      "failed over unpublished",
      { unpublishedAt: at, latestPublication: { state: "failed" } },
      "failed",
    ],
    [
      "failed over changed",
      { publishedVersion: 1, latestPublication: { state: "failed" } },
      "failed",
    ],
    ["unpublished over changed", { publishedVersion: 1, unpublishedAt: at }, "unpublished"],
    ["unpublished over draft", { publishedVersion: null, unpublishedAt: at }, "unpublished"],
  ])("%s -> %s", (_name, override, expected) => {
    expect(articleStatus({ ...base, ...override })).toBe(expected);
  });
});

describe("ownsCommittedFile", () => {
  const event = (
    kind: PublicationEvent["kind"],
    state: PublicationEvent["state"],
    commitSha: string | null,
    day: number,
  ): PublicationEvent => ({
    kind,
    state,
    commitSha,
    createdAt: new Date(Date.UTC(2026, 9, day)),
  });
  it.each<[string, PublicationEvent[], boolean]>([
    ["no publications", [], false],
    ["a publish that never reached git", [event("publish", "failed", null, 1)], false],
    ["a publish with a commit", [event("publish", "failed", "sha", 1)], true],
    [
      "the file was removed after the commit",
      [event("publish", "published", "a", 1), event("unpublish", "published", "b", 2)],
      false,
    ],
    [
      "published again after an unpublish",
      [
        event("unpublish", "published", "b", 2),
        event("publish", "publishing", "c", 3),
        event("publish", "published", "a", 1),
      ],
      true,
    ],
    [
      "an unpublish that has not finished does not take the file away",
      [event("publish", "published", "a", 1), event("unpublish", "publishing", "b", 2)],
      true,
    ],
    [
      "a failed unpublish does not take the file away",
      [event("publish", "published", "a", 1), event("unpublish", "failed", "b", 2)],
      true,
    ],
  ])("%s -> %s", (_name, events, expected) => {
    expect(ownsCommittedFile(events)).toBe(expected);
  });
});

describe("buildPointerAfterFailure", () => {
  const ev = (
    id: string,
    kind: "publish" | "unpublish",
    state: PublicationEvent["state"],
    day: number,
  ) => ({
    id,
    kind,
    state,
    createdAt: new Date(Date.UTC(2026, 9, day)),
  });
  it("returns the newest other published publication", () => {
    expect(
      buildPointerAfterFailure(
        [
          ev("p1", "publish", "published", 1),
          ev("p2", "publish", "published", 2),
          ev("p3", "publish", "publishing", 3),
        ],
        "p3",
      ),
    ).toBe("p2");
  });
  it("returns null when an unpublish was the last to finish: a removed article stays out", () => {
    expect(
      buildPointerAfterFailure(
        [
          ev("p1", "publish", "published", 1),
          ev("u1", "unpublish", "published", 2),
          ev("p2", "publish", "queued", 3),
        ],
        "p2",
      ),
    ).toBeNull();
  });
  it("ignores queued and failed rows and the failed job itself; null when nothing was published", () => {
    expect(
      buildPointerAfterFailure(
        [
          ev("p1", "publish", "failed", 1),
          ev("p2", "publish", "published", 2),
          ev("u1", "unpublish", "failed", 3),
          ev("p3", "publish", "failed", 4),
        ],
        "p3",
      ),
    ).toBe("p2");
    expect(buildPointerAfterFailure([ev("p1", "publish", "failed", 1)], "p1")).toBeNull();
  });
});
