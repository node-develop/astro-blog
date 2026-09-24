import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildProductionSmokeEnvironment, stopServer } from "../support/production-server";

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

  it("escalates shutdown and fails if the child remains alive", async () => {
    const child = new FakeChildProcess();

    await expect(
      stopServer(child as unknown as ChildProcess, { termTimeoutMs: 1, killTimeoutMs: 1 }),
    ).rejects.toThrow("remained alive after SIGKILL");
    expect(child.signals).toEqual(["SIGTERM", "SIGKILL"]);
  });
});
