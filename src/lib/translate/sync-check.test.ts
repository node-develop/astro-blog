import { describe, it, expect } from "vitest";
import { detectDrift, detectMissingTwins, type TwinState } from "./sync-check";

describe("detectDrift", () => {
  it("returns no issues when all RU posts have matching EN twins", () => {
    const result = detectDrift([
      {
        slug: "01-foo",
        ruHash: "abc",
        enHash: "abc",
        enExists: true,
        enManual: false,
        ruDraft: false,
      },
    ]);
    expect(result.drift).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("flags missing EN twin", () => {
    const result = detectDrift([
      {
        slug: "01-foo",
        ruHash: "abc",
        enHash: null,
        enExists: false,
        enManual: false,
        ruDraft: false,
      },
    ]);
    expect(result.missing).toEqual(["01-foo"]);
    expect(result.drift).toEqual([]);
  });

  it("flags hash mismatch (drift) for non-manual files", () => {
    const result = detectDrift([
      {
        slug: "01-foo",
        ruHash: "new",
        enHash: "old",
        enExists: true,
        enManual: false,
        ruDraft: false,
      },
    ]);
    expect(result.drift).toEqual(["01-foo"]);
    expect(result.missing).toEqual([]);
  });

  it("ignores drafts entirely", () => {
    const result = detectDrift([
      { slug: "draft", ruHash: "x", enHash: null, enExists: false, enManual: false, ruDraft: true },
    ]);
    expect(result.missing).toEqual([]);
    expect(result.drift).toEqual([]);
  });

  it("manuallyEdited drift is a warning, not a failure", () => {
    const result = detectDrift([
      {
        slug: "01-foo",
        ruHash: "new",
        enHash: "old",
        enExists: true,
        enManual: true,
        ruDraft: false,
      },
    ]);
    expect(result.drift).toEqual([]);
    expect(result.warnings).toEqual(["01-foo"]);
  });

  it("ignores e2e fixture slugs (e2e-*) regardless of state", () => {
    const result = detectDrift([
      {
        slug: "e2e-ru-only",
        ruHash: "x",
        enHash: null,
        enExists: false,
        enManual: false,
        ruDraft: false,
      },
      {
        slug: "e2e-something",
        ruHash: "y",
        enHash: "stale",
        enExists: true,
        enManual: false,
        ruDraft: false,
      },
    ]);
    expect(result.missing).toEqual([]);
    expect(result.drift).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("aggregates multiple files correctly", () => {
    const result = detectDrift([
      { slug: "ok", ruHash: "a", enHash: "a", enExists: true, enManual: false, ruDraft: false },
      {
        slug: "missing",
        ruHash: "b",
        enHash: null,
        enExists: false,
        enManual: false,
        ruDraft: false,
      },
      {
        slug: "drift",
        ruHash: "c",
        enHash: "old",
        enExists: true,
        enManual: false,
        ruDraft: false,
      },
      {
        slug: "manual-stale",
        ruHash: "d",
        enHash: "old",
        enExists: true,
        enManual: true,
        ruDraft: false,
      },
      { slug: "draft", ruHash: "e", enHash: null, enExists: false, enManual: false, ruDraft: true },
    ]);
    expect(result.missing).toEqual(["missing"]);
    expect(result.drift).toEqual(["drift"]);
    expect(result.warnings).toEqual(["manual-stale"]);
  });
});

it.each([false, true])("allows independently managed API locales (EN exists: %s)", (enExists) => {
  expect(
    detectDrift([
      {
        slug: "api-article",
        ruHash: "new",
        enHash: enExists ? "old" : null,
        enExists,
        enManual: false,
        ruDraft: false,
        apiManaged: true,
      },
    ]),
  ).toEqual({ missing: [], drift: [], warnings: [] });
});

describe("detectMissingTwins", () => {
  const paired: TwinState = {
    collection: "lessons",
    slug: "claude-code-guide/01-introduction",
    ru: "built",
    en: "built",
  };

  it("reports nothing when every page has its twin", () => {
    expect(detectMissingTwins([paired])).toEqual({ missingEn: [], missingRu: [], unbuilt: [] });
  });

  it("flags a lesson published in Russian only", () => {
    const result = detectMissingTwins([
      paired,
      { collection: "lessons", slug: "claude-code-guide/15-new", ru: "built", en: "absent" },
    ]);
    expect(result.missingEn).toEqual(["lessons/claude-code-guide/15-new"]);
    expect(result.missingRu).toEqual([]);
    expect(result.unbuilt).toEqual([]);
  });

  it("flags an EN twin left without its RU source, for every collection", () => {
    const result = detectMissingTwins([
      { collection: "projects", slug: "old-project", ru: "absent", en: "built" },
      { collection: "courses", slug: "old-course", ru: "absent", en: "built" },
      { collection: "site", slug: "uses", ru: "absent", en: "built" },
    ]);
    expect(result.missingRu).toEqual(["projects/old-project", "courses/old-course", "site/uses"]);
    expect(result.missingEn).toEqual([]);
  });

  it("flags a twin file the page route would not build, naming the side", () => {
    const result = detectMissingTwins([
      { collection: "lessons", slug: "claude-code-guide/02-cache", ru: "built", en: "unbuilt" },
      { collection: "courses", slug: "claude-code-guide", ru: "unbuilt", en: "built" },
    ]);
    expect(result.unbuilt).toEqual([
      "lessons/claude-code-guide/02-cache (en)",
      "courses/claude-code-guide (ru)",
    ]);
    // The file is there, so it is not reported a second time as missing.
    expect(result.missingEn).toEqual([]);
    expect(result.missingRu).toEqual([]);
  });

  it("ignores e2e fixtures, as a slug or as the lesson part of one", () => {
    const result = detectMissingTwins([
      { collection: "projects", slug: "e2e-ru-only", ru: "built", en: "absent" },
      { collection: "lessons", slug: "claude-code-guide/e2e-lesson", ru: "built", en: "absent" },
      { collection: "lessons", slug: "e2e-course/01-intro", ru: "absent", en: "built" },
    ]);
    expect(result).toEqual({ missingEn: [], missingRu: [], unbuilt: [] });
  });
});
