import { describe, it, expect } from "vitest";
import { decideAction } from "./decide-action";

describe("decideAction", () => {
  it("returns 'translate' when EN file does not exist", () => {
    expect(decideAction({ ruHash: "a", existingEn: null, force: false })).toEqual({
      action: "translate",
    });
  });

  it("returns 'skip' when EN exists with matching hash and not manuallyEdited", () => {
    expect(
      decideAction({
        ruHash: "a",
        existingEn: { sourceHash: "a", manuallyEdited: false },
        force: false,
      }),
    ).toEqual({ action: "skip", reason: "cache-hit" });
  });

  it("returns 'translate' when hash differs and not manuallyEdited", () => {
    expect(
      decideAction({
        ruHash: "new",
        existingEn: { sourceHash: "old", manuallyEdited: false },
        force: false,
      }),
    ).toEqual({ action: "translate" });
  });

  it("returns 'skip' when manuallyEdited and hash matches", () => {
    expect(
      decideAction({
        ruHash: "a",
        existingEn: { sourceHash: "a", manuallyEdited: true },
        force: false,
      }),
    ).toEqual({ action: "skip", reason: "manual-fresh" });
  });

  it("returns 'warn' when manuallyEdited but hash differs (stale manual edit)", () => {
    expect(
      decideAction({
        ruHash: "new",
        existingEn: { sourceHash: "old", manuallyEdited: true },
        force: false,
      }),
    ).toEqual({ action: "warn", reason: "manual-stale" });
  });

  it("force=true overrides everything (still translates if manuallyEdited)", () => {
    expect(
      decideAction({
        ruHash: "a",
        existingEn: { sourceHash: "a", manuallyEdited: true },
        force: true,
      }),
    ).toEqual({ action: "translate", reason: "force" });
  });

  it("never regenerates a post the content API owns, even with force", () => {
    expect(
      decideAction({
        ruHash: "new",
        existingEn: { sourceHash: null, manuallyEdited: false },
        force: true,
        apiManaged: true,
      }),
    ).toEqual({ action: "skip", reason: "api-managed" });
  });
});
