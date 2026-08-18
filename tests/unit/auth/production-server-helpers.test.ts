import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildProductionSmokeEnvironment,
  fetchWithTimeout,
  hasProcessExited,
  stopServer,
  waitForOutput,
} from "../../integration/production-server.helpers";

class FakeChildProcess extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly signals: NodeJS.Signals[] = [];

  kill(signal: NodeJS.Signals): boolean {
    this.signals.push(signal);
    return true;
  }
}

describe("production server smoke helpers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("masks auth configuration even when the base environment contains values", () => {
    const environment = buildProductionSmokeEnvironment(
      {
        BETTER_AUTH_SECRET: "value-loaded-from-dotenv",
        BETTER_AUTH_URL: "https://configured.example",
        UNRELATED: "preserved",
      },
      { host: "127.0.0.1", port: 4321, siteUrl: "https://artka.dev" },
    );

    expect(environment).toMatchObject({
      BETTER_AUTH_SECRET: "",
      BETTER_AUTH_URL: "",
      HOST: "127.0.0.1",
      PORT: "4321",
      SITE_URL: "https://artka.dev",
      UNRELATED: "preserved",
    });
  });

  it("treats either an exit code or signal code as an exited process", () => {
    const child = new FakeChildProcess();
    expect(hasProcessExited(child as unknown as ChildProcess)).toBe(false);

    child.signalCode = "SIGTERM";
    expect(hasProcessExited(child as unknown as ChildProcess)).toBe(true);
  });

  it("adds an abort timeout to every fetch", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response("ok");
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchWithTimeout("http://127.0.0.1/example", { redirect: "manual" }, 50);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("escalates shutdown and fails if the child remains alive", async () => {
    const child = new FakeChildProcess();

    await expect(
      stopServer(child as unknown as ChildProcess, { termTimeoutMs: 1, killTimeoutMs: 1 }),
    ).rejects.toThrow("remained alive after SIGKILL");
    expect(child.signals).toEqual(["SIGTERM", "SIGKILL"]);
  });

  it("polls captured output until a bounded diagnostic appears", async () => {
    let output = "";
    setTimeout(() => {
      output = "BETTER_AUTH_SECRET is required";
    }, 5);

    await expect(
      waitForOutput(() => output, "BETTER_AUTH_SECRET is required", 100, 1),
    ).resolves.toBe(undefined);
    await expect(waitForOutput(() => output, "never emitted", 1, 1)).rejects.toThrow(
      "Timed out waiting for server output",
    );
  });
});
