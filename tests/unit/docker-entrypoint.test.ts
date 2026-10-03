import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The script ends in `exec node ./dist/server/entry.mjs`. A stub `node` first
// on PATH lets it run to the end without starting a server or a worker; no
// DATABASE_URL keeps it away from the migrations.
describe("docker-entrypoint.sh publication worker secret", () => {
  let bin: string;
  beforeAll(() => {
    bin = mkdtempSync(join(tmpdir(), "entrypoint-test-"));
    writeFileSync(join(bin, "node"), "#!/bin/sh\nexit 0\n");
    chmodSync(join(bin, "node"), 0o755);
  });
  afterAll(() => rmSync(bin, { recursive: true, force: true }));

  const run = (secret: string | undefined) =>
    spawnSync("sh", ["docker-entrypoint.sh"], {
      env: {
        PATH: `${bin}:/usr/bin:/bin`,
        ...(secret === undefined ? {} : { CONTENT_WORKER_SECRET: secret }),
      },
      encoding: "utf8",
      timeout: 10_000,
    });

  it("a secret that is set but too short aborts container start", () => {
    const result = run("a".repeat(31));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CONTENT_WORKER_SECRET must be at least 32 bytes");
    expect(result.stdout).not.toContain("starting astro server");
  });

  it.each([
    ["exactly 32 bytes", "a".repeat(32)],
    ["unset (worker deliberately disabled)", undefined],
  ])("a secret that is %s lets the server start", (_label, secret) => {
    const result = run(secret);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("starting astro server");
  });
});
