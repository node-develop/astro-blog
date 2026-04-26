import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeMediaToPublic, makeMediaSubpath } from "./media-writer";

describe("makeMediaSubpath", () => {
  it("derives YYYY/MM from a Date", () => {
    const d = new Date("2026-04-23T00:00:00Z");
    expect(makeMediaSubpath(d)).toBe("2026/04");
  });
});

describe("writeMediaToPublic", () => {
  it("writes bytes and returns a relative path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "media-writer-"));
    try {
      const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG magic
      const result = await writeMediaToPublic(dir, "hello.png", bytes, new Date("2026-04-23"));
      expect(result.relativePath.startsWith("2026/04/")).toBe(true);
      const readback = await readFile(result.absolutePath);
      expect(readback.equals(Buffer.from(bytes))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("avoids filename collisions with a suffix", async () => {
    const dir = await mkdtemp(join(tmpdir(), "media-writer-"));
    try {
      const bytes = new Uint8Array([1, 2, 3]);
      const a = await writeMediaToPublic(dir, "same.bin", bytes, new Date("2026-04-23"));
      const b = await writeMediaToPublic(dir, "same.bin", bytes, new Date("2026-04-23"));
      expect(a.relativePath).not.toBe(b.relativePath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects filenames with path separators", async () => {
    const dir = await mkdtemp(join(tmpdir(), "media-writer-"));
    try {
      await expect(() =>
        writeMediaToPublic(dir, "../evil.png", new Uint8Array([0]), new Date()),
      ).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
