import { afterEach, describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";
import { GET } from "~/pages/api/version";
import {
  WORKER_MAX_SILENCE_MS,
  createHeartbeat,
  workerHealth,
  workerSecretFromEnv,
} from "~/lib/content-api/heartbeat";

describe("publication worker liveness (drives the Docker healthcheck)", () => {
  const startedAt = 1_000_000;

  it("a deliberately disabled worker never turns the container unhealthy", () => {
    expect(
      workerHealth({ enabled: false, startedAt, lastTickAt: null, now: startedAt + 10 ** 9 }),
    ).toBe("disabled");
  });

  it("before the first tick the silence is counted from process start, to the millisecond", () => {
    const at = (now: number) => workerHealth({ enabled: true, startedAt, lastTickAt: null, now });
    expect(at(startedAt + WORKER_MAX_SILENCE_MS)).toBe("ok");
    expect(at(startedAt + WORKER_MAX_SILENCE_MS + 1)).toBe("stale");
  });

  it("a tick resets the silence; a worker that stops ticking goes stale again", () => {
    let clock = startedAt;
    const heartbeat = createHeartbeat(() => clock);
    const status = () => workerHealth({ enabled: true, ...heartbeat.read(), now: clock });

    clock += WORKER_MAX_SILENCE_MS + 1;
    expect(status()).toBe("stale");
    heartbeat.beat();
    expect(status()).toBe("ok");
    clock += WORKER_MAX_SILENCE_MS + 1;
    expect(status()).toBe("stale");
  });

  it("a secret shorter than 32 bytes does not enable the worker", () => {
    expect(workerSecretFromEnv({ CONTENT_WORKER_SECRET: "a".repeat(31) })).toBeNull();
    expect(workerSecretFromEnv({ CONTENT_WORKER_SECRET: "a".repeat(32) })).toBe("a".repeat(32));
    expect(workerSecretFromEnv({})).toBeNull();
  });

  it("counts bytes like the entrypoint does, so a non-ASCII secret is judged the same everywhere", () => {
    // 16 Cyrillic characters are 32 bytes: dash's ${#VAR} lets them through.
    expect(workerSecretFromEnv({ CONTENT_WORKER_SECRET: "я".repeat(16) })).toBe("я".repeat(16));
    expect(workerSecretFromEnv({ CONTENT_WORKER_SECRET: "я".repeat(15) })).toBeNull();
  });
});

describe("GET /api/version as the Docker healthcheck", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
  const silentFor = (ms: number) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + ms);
  };

  it("answers 503 with a readable body once an enabled worker has been silent too long", async () => {
    vi.stubEnv("CONTENT_WORKER_SECRET", "a".repeat(32));
    silentFor(WORKER_MAX_SILENCE_MS + 60_000);
    const response = await GET({} as APIContext);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      commit: expect.any(String),
      worker: { status: "stale" },
    });
  });

  it("stays 200 when the worker is deliberately disabled, however long it has been silent", async () => {
    vi.stubEnv("CONTENT_WORKER_SECRET", "");
    vi.stubEnv("CONTENT_SNAPSHOT_ID", "00000000-0000-4000-8000-0000000000aa");
    silentFor(WORKER_MAX_SILENCE_MS + 60_000);
    const response = await GET({} as APIContext);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      contentSnapshotId: "00000000-0000-4000-8000-0000000000aa",
      worker: { status: "disabled" },
    });
  });
});
