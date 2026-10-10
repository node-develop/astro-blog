import { describe, it, expect } from "vitest";
import { detectDrift, detectMissingTwins, shouldFail, type TwinState } from "./sync-check";

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
  const paired: TwinState = { collection: "site", slug: "about", ru: "built", en: "built" };

  it("reports nothing when every page has its twin", () => {
    expect(detectMissingTwins([paired])).toEqual({ missingEn: [], missingRu: [] });
  });

  it("flags a page published in Russian only", () => {
    const result = detectMissingTwins([
      paired,
      { collection: "projects", slug: "new-project", ru: "built", en: "absent" },
    ]);
    expect(result.missingEn).toEqual(["projects/new-project"]);
    expect(result.missingRu).toEqual([]);
  });

  it("flags an EN twin left without its RU source, for every collection", () => {
    const result = detectMissingTwins([
      { collection: "projects", slug: "old-project", ru: "absent", en: "built" },
      { collection: "site", slug: "uses", ru: "absent", en: "built" },
    ]);
    expect(result.missingRu).toEqual(["projects/old-project", "site/uses"]);
    expect(result.missingEn).toEqual([]);
  });

  it("ignores e2e fixtures", () => {
    const result = detectMissingTwins([
      { collection: "projects", slug: "e2e-ru-only", ru: "built", en: "absent" },
      { collection: "site", slug: "e2e-en-only", ru: "absent", en: "built" },
    ]);
    expect(result).toEqual({ missingEn: [], missingRu: [] });
  });
});

describe("shouldFail (what stops CI in translate:check)", () => {
  const clean = {
    report: { missing: [], drift: [], warnings: [] },
    twins: { missingEn: [], missingRu: [] },
    schemaErrorCount: 0,
  };

  it("a twin that lags behind its RU source is reported, not fatal", () => {
    expect(
      shouldFail({ ...clean, report: { missing: [], drift: ["01-foo"], warnings: ["02-bar"] } }),
    ).toBe(false);
  });

  it.each([
    ["a post without an EN twin", { report: { missing: ["01-foo"], drift: [], warnings: [] } }],
    ["a page without an EN twin", { twins: { ...clean.twins, missingEn: ["site/about"] } }],
    ["an orphaned EN twin", { twins: { ...clean.twins, missingRu: ["projects/x"] } }],
    ["an EN schema violation", { schemaErrorCount: 1 }],
  ])("%s still fails", (_label, broken) => {
    expect(shouldFail({ ...clean, ...broken })).toBe(true);
  });
});
