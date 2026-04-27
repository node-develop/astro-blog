import { describe, it, expect } from "vitest";
import { detectDrift } from "./sync-check";

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
