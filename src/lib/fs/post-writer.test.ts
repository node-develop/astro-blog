import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePostAtomically } from "./post-writer";

async function inTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const base = await mkdtemp(join(tmpdir(), "post-writer-"));
  try {
    return await fn(base);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}

describe("writePostAtomically", () => {
  it("creates the file when absent", async () => {
    await inTempDir(async (dir) => {
      await writePostAtomically(dir, "foo", "hello\n");
      const content = await readFile(join(dir, "foo.md"), "utf8");
      expect(content).toBe("hello\n");
    });
  });

  it("overwrites an existing file atomically", async () => {
    await inTempDir(async (dir) => {
      await writePostAtomically(dir, "foo", "v1\n");
      await writePostAtomically(dir, "foo", "v2\n");
      const content = await readFile(join(dir, "foo.md"), "utf8");
      expect(content).toBe("v2\n");
    });
  });

  it("rejects path traversal slugs", async () => {
    await inTempDir(async (dir) => {
      await expect(() => writePostAtomically(dir, "../evil", "x")).rejects.toThrow();
    });
  });

  it("rejects slugs with illegal characters", async () => {
    await inTempDir(async (dir) => {
      await expect(() => writePostAtomically(dir, "evil/sub", "x")).rejects.toThrow(/slug/);
      await expect(() => writePostAtomically(dir, "", "x")).rejects.toThrow(/slug/);
    });
  });
});
