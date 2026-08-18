import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildProductionSmokeEnvironment,
  fetchWithTimeout,
  hasProcessExited,
  parseListeningOrigin,
  stopServer,
  waitForListeningOrigin,
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

  it("uses port zero and masks database/auth/service credentials instead of inheriting them", () => {
    const environment = buildProductionSmokeEnvironment(
      {
        PATH: "/safe/bin",
        BETTER_AUTH_SECRET: "value-loaded-from-dotenv",
        BETTER_AUTH_URL: "https://configured.example",
        DATABASE_URL: "postgres://external.example/private",
        ANTHROPIC_API_KEY: "external-api-key",
        GITHUB_PAT: "external-github-token",
        UNRELATED: "must-not-be-inherited",
      },
      { host: "127.0.0.1", siteUrl: "https://artka.dev", auth: "unconfigured" },
    );

    expect(environment).toMatchObject({
      BETTER_AUTH_SECRET: "",
      BETTER_AUTH_URL: "",
      DATABASE_URL: "",
      ANTHROPIC_API_KEY: "",
      GITHUB_PAT: "",
      HOST: "127.0.0.1",
      PORT: "0",
      SITE_URL: "https://artka.dev",
      PATH: "/safe/bin",
    });
    expect(environment.UNRELATED).toBeUndefined();
  });

  it("can enable only a fixed test auth secret while database access remains disabled", () => {
    const environment = buildProductionSmokeEnvironment(
      { DATABASE_URL: "postgres://external.example/private" },
      { host: "127.0.0.1", siteUrl: "https://artka.dev", auth: "test" },
    );

    expect(environment.BETTER_AUTH_SECRET?.length).toBeGreaterThanOrEqual(32);
    expect(environment.BETTER_AUTH_URL).toBe("https://artka.dev");
    expect(environment.DATABASE_URL).toBe("");
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

  it("parses and polls the adapter-selected origin without a free-port probe", async () => {
    const child = new FakeChildProcess();
    let output = "";
    setTimeout(() => {
      output = "Server listening on http://127.0.0.1:51847";
    }, 5);

    expect(parseListeningOrigin(output)).toBeNull();
    await expect(
      waitForListeningOrigin(child as unknown as ChildProcess, () => output, 100, 1),
    ).resolves.toBe("http://127.0.0.1:51847");
  });

  it("reports both exit code and signal code in early-exit diagnostics", async () => {
    const child = new FakeChildProcess();
    child.signalCode = "SIGTERM";

    await expect(
      waitForListeningOrigin(child as unknown as ChildProcess, () => "startup failed", 100, 1),
    ).rejects.toThrow("exitCode=null signalCode=SIGTERM");
  });
});
