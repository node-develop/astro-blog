import { describe, expect, it } from "vitest";
import { articleStatus, type StatusInput } from "~/lib/content-api/status";

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
