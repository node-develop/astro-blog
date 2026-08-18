import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildProductionSmokeEnvironment,
  fetchWithTimeout,
  hasProcessExited,
  stopServer,
  waitForOutput,
} from "./production-server.helpers";

const getFreePort = async (): Promise<number> =>
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a production-smoke port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });

const waitUntilReady = async (
  origin: string,
  child: ChildProcess,
  serverOutput: () => string,
): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (hasProcessExited(child)) {
      throw new Error(
        `Standalone server exited with ${child.exitCode ?? child.signalCode}:\n${serverOutput()}`,
      );
    }
    try {
      const response = await fetchWithTimeout(`${origin}/robots.txt`, { redirect: "manual" }, 500);
      await response.body?.cancel();
      if (response.status === 200) return;
    } catch {
      // The port is expected to refuse connections briefly while Astro starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for standalone server:\n${serverOutput()}`);
};

const status = async (origin: string, pathname: string, headers?: HeadersInit): Promise<number> => {
  const response = await fetchWithTimeout(`${origin}${pathname}`, {
    headers,
    redirect: "manual",
  });
  await response.body?.cancel();
  return response.status;
};

const redirect = async (
  origin: string,
  pathname: string,
  headers?: HeadersInit,
): Promise<{ readonly status: number; readonly location: string | null }> => {
  const response = await fetchWithTimeout(`${origin}${pathname}`, {
    headers,
    redirect: "manual",
  });
  await response.body?.cancel();
  return { status: response.status, location: response.headers.get("location") };
};

describe("production standalone server", () => {
  it("serves public SEO routes without auth configuration and normalizes only trusted hosts", async () => {
    const port = await getFreePort();
    const origin = `http://127.0.0.1:${port}`;
    let output = "";

    const child = spawn(process.execPath, [join(process.cwd(), "dist/server/entry.mjs")], {
      cwd: process.cwd(),
      env: buildProductionSmokeEnvironment(process.env, {
        host: "127.0.0.1",
        port,
        siteUrl: "https://artka.dev",
      }),
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      output += chunk.toString();
    });

    try {
      await waitUntilReady(origin, child, () => output);

      for (const pathname of ["/", "/blog/", "/en/", "/en/blog/"]) {
        expect(await status(origin, pathname), `${pathname}\n${output}`).toBe(200);
      }

      expect(await redirect(origin, "/blog")).toEqual({ status: 301, location: "/blog/" });
      expect(await redirect(origin, "/blog/02-context-and-cache/")).toEqual({
        status: 301,
        location: "/courses/claude-code-guide/02-context-and-cache/",
      });

      for (const pathname of ["/robots.txt", "/rss.xml", "/sitemap-index.xml", "/llms-full.txt"]) {
        expect(await status(origin, pathname), pathname).toBe(200);
      }

      expect(await status(origin, "/privacy/")).toBe(404);
      expect(
        await redirect(origin, "/llms-full.txt?x=1", {
          "x-forwarded-host": "www.artka.dev",
        }),
      ).toEqual({ status: 301, location: "https://artka.dev/llms-full.txt?x=1" });
      expect(await redirect(origin, "/llms-full.txt", { "x-forwarded-host": "evil.test" })).toEqual(
        {
          status: 200,
          location: null,
        },
      );

      expect(await status(origin, "/api/auth/get-session/")).toBe(500);
      await waitForOutput(() => output, "BETTER_AUTH_SECRET is required", 1_000);
      expect(output).toContain("BETTER_AUTH_SECRET is required");
    } finally {
      await stopServer(child);
    }
  });
});
