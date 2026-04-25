import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockSpawn, mockExistsSync } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockExistsSync: vi.fn(() => true),
}));

vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
}));

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
}));

import {
  schedulePagefindRebuild,
  __testReset,
  REBUILD_DEBOUNCE_MS,
} from "~/lib/search/pagefind-rebuild";

describe("schedulePagefindRebuild", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSpawn.mockReset();
    mockSpawn.mockReturnValue({ on: vi.fn() });
    mockExistsSync.mockReturnValue(true);
    __testReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces multiple calls for the same slug", () => {
    schedulePagefindRebuild("post-a");
    schedulePagefindRebuild("post-a");
    schedulePagefindRebuild("post-a");
    vi.advanceTimersByTime(REBUILD_DEBOUNCE_MS - 1);
    expect(mockSpawn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it("fires once per slug after debounce", () => {
    schedulePagefindRebuild("post-a");
    schedulePagefindRebuild("post-b");
    vi.advanceTimersByTime(REBUILD_DEBOUNCE_MS + 10);
    // Both slugs share a single rebuild — debounce is global, not per-slug.
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it("no-ops when dist/ does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    schedulePagefindRebuild("post-a");
    vi.advanceTimersByTime(REBUILD_DEBOUNCE_MS + 10);
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});
