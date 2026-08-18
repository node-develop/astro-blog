import type { ChildProcess } from "node:child_process";

interface ProductionSmokeEnvironmentOptions {
  readonly host: string;
  readonly port: number;
  readonly siteUrl: string;
}

interface StopServerOptions {
  readonly termTimeoutMs?: number;
  readonly killTimeoutMs?: number;
}

const delay = async (timeoutMs: number): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, timeoutMs));

export const buildProductionSmokeEnvironment = (
  baseEnvironment: NodeJS.ProcessEnv,
  options: ProductionSmokeEnvironmentOptions,
): NodeJS.ProcessEnv => ({
  ...baseEnvironment,
  BETTER_AUTH_SECRET: "",
  BETTER_AUTH_URL: "",
  HOST: options.host,
  PORT: String(options.port),
  SITE_URL: options.siteUrl,
});

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
