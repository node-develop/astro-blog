import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

interface ProductionSmokeEnvironmentOptions {
  readonly host: string;
  readonly siteUrl: string;
  readonly auth: "unconfigured" | "test";
}

interface StopServerOptions {
  readonly termTimeoutMs?: number;
  readonly killTimeoutMs?: number;
}

interface StartProductionServerOptions extends ProductionSmokeEnvironmentOptions {
  readonly cwd?: string;
  readonly readyTimeoutMs?: number;
}

export interface StartedProductionServer {
  readonly child: ChildProcess;
  readonly origin: string;
  readonly output: () => string;
}

const delay = async (timeoutMs: number): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, timeoutMs));

const SAFE_INHERITED_ENVIRONMENT_KEYS = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ"] as const;

const MASKED_SERVICE_ENVIRONMENT_KEYS = [
  "DATABASE_URL",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "ADMIN_NAME",
  "ANTHROPIC_API_KEY",
  "GITHUB_PAT",
  "GITHUB_REPO_OWNER",
  "GITHUB_REPO_NAME",
  "GITHUB_DEFAULT_BRANCH",
  "X_CLIENT_ID",
  "X_CLIENT_SECRET",
  "X_OAUTH_TOKEN",
  "X_OAUTH_REFRESH",
  "X_HANDLE",
  "LINKEDIN_CLIENT_ID",
  "LINKEDIN_CLIENT_SECRET",
  "LINKEDIN_ACCESS_TOKEN",
  "LINKEDIN_REFRESH_TOKEN",
  "LINKEDIN_PERSON_URN",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHANNEL_ID",
] as const;

const TEST_AUTH_SECRET = "standalone-runtime-test-only-secret-not-for-production";

export const buildProductionSmokeEnvironment = (
  baseEnvironment: NodeJS.ProcessEnv,
  options: ProductionSmokeEnvironmentOptions,
): NodeJS.ProcessEnv => {
  const inherited = Object.fromEntries(
    SAFE_INHERITED_ENVIRONMENT_KEYS.flatMap((key) =>
      baseEnvironment[key] === undefined ? [] : [[key, baseEnvironment[key]]],
    ),
  );
  const masked = Object.fromEntries(MASKED_SERVICE_ENVIRONMENT_KEYS.map((key) => [key, ""]));

  return {
    ...inherited,
    ...masked,
    ASTRO_TELEMETRY_DISABLED: "1",
    BETTER_AUTH_SECRET: options.auth === "test" ? TEST_AUTH_SECRET : "",
    BETTER_AUTH_URL: options.auth === "test" ? options.siteUrl : "",
    HOST: options.host,
    LOG_LEVEL: "fatal",
    NODE_ENV: "test",
    PORT: "0",
    SITE_URL: options.siteUrl,
    SOCIAL_DRAFTS_ENABLED: "false",
  };
};

export const hasProcessExited = (child: ChildProcess): boolean =>
  child.exitCode !== null || child.signalCode !== null;

export const waitForExit = async (child: ChildProcess, timeoutMs: number): Promise<boolean> =>
  await new Promise((resolve) => {
    if (hasProcessExited(child)) {
      resolve(true);
      return;
    }
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolve(hasProcessExited(child));
    }, timeoutMs);
    child.once("exit", onExit);
  });

export const stopServer = async (
  child: ChildProcess,
  options: StopServerOptions = {},
): Promise<void> => {
  if (hasProcessExited(child)) return;

  child.kill("SIGTERM");
  if (await waitForExit(child, options.termTimeoutMs ?? 2_000)) return;

  child.kill("SIGKILL");
  if (await waitForExit(child, options.killTimeoutMs ?? 2_000)) return;

  throw new Error("Standalone server remained alive after SIGKILL");
};

export const fetchWithTimeout = async (
  input: string | URL | Request,
  init: RequestInit = {},
  timeoutMs = 3_000,
): Promise<Response> => {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  return await fetch(input, { ...init, signal });
};

export const parseListeningOrigin = (output: string): string | null =>
  output.match(/Server listening on (https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):\d+)/)?.[1] ??
  null;

export const waitForListeningOrigin = async (
  child: ChildProcess,
  output: () => string,
  timeoutMs: number,
  pollIntervalMs = 20,
): Promise<string> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (hasProcessExited(child)) {
      throw new Error(
        `Standalone server exited before listening (exitCode=${child.exitCode} signalCode=${child.signalCode}):\n${output()}`,
      );
    }
    const origin = parseListeningOrigin(output());
    if (origin) return origin;
    await delay(Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())));
  }
  throw new Error(`Timed out waiting for standalone server origin:\n${output()}`);
};

export const startProductionServer = async (
  options: StartProductionServerOptions,
): Promise<StartedProductionServer> => {
  const cwd = options.cwd ?? process.cwd();
  let capturedOutput = "";
  const output = (): string => capturedOutput;
  const child = spawn(process.execPath, [join(cwd, "dist/server/entry.mjs")], {
    cwd,
    env: buildProductionSmokeEnvironment(process.env, options),
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => {
    capturedOutput += chunk.toString();
  });
  child.stderr?.on("data", (chunk) => {
    capturedOutput += chunk.toString();
  });

  try {
    const timeoutMs = options.readyTimeoutMs ?? 8_000;
    const origin = await waitForListeningOrigin(child, output, timeoutMs);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      if (hasProcessExited(child)) {
        throw new Error(
          `Standalone server exited during readiness (exitCode=${child.exitCode} signalCode=${child.signalCode}):\n${output()}`,
        );
      }
      try {
        const response = await fetchWithTimeout(
          `${origin}/robots.txt`,
          { redirect: "manual" },
          500,
        );
        await response.body?.cancel();
        if (response.status === 200) return { child, origin, output };
      } catch {
        // The adapter can log its origin just before the first request is accepted.
      }
      await delay(Math.min(50, Math.max(1, deadline - Date.now())));
    }
    throw new Error(`Timed out waiting for standalone server readiness:\n${output()}`);
  } catch (error) {
    await stopServer(child).catch(() => undefined);
    throw error;
  }
};

export const waitForOutput = async (
  output: () => string,
  expected: string,
  timeoutMs: number,
  pollIntervalMs = 20,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (output().includes(expected)) return;
    await delay(Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())));
  }
  throw new Error(`Timed out waiting for server output: ${expected}`);
};
