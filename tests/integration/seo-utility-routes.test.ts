import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const getFreePort = async (): Promise<number> =>
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a test server port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });

const stopServer = async (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve();
    }, 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
};

const fetchBuiltRoute = async (
  origin: string,
  path: string,
  child: ChildProcess,
  serverOutput: () => string,
): Promise<string> => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Standalone server exited with ${child.exitCode}:\n${serverOutput()}`);
    }
    try {
      const response = await fetch(`${origin}${path}`, { redirect: "follow" });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(`${path} returned ${response.status}:\n${body.slice(0, 1_000)}`);
      }
      return body;
    } catch (error) {
      if (attempt === 79) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`Timed out fetching ${path}`);
};

const metaContent = (html: string, name: string): string | undefined => {
  const tag = html.match(new RegExp(`<meta\\b(?=[^>]*\\bname=["']${name}["'])[^>]*>`, "i"))?.[0];
  return tag?.match(/\bcontent=["']([^"']+)["']/i)?.[1];
};

describe("built utility routes", () => {
  it("serves crawlable noindex pages and localized English search UI", async () => {
    const port = await getFreePort();
    const origin = `http://127.0.0.1:${port}`;
    let output = "";
    const child = spawn(process.execPath, [join(process.cwd(), "dist/server/entry.mjs")], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: String(port),
        BETTER_AUTH_SECRET: "test-only-better-auth-secret-32-characters",
        BETTER_AUTH_URL: origin,
        SITE_URL: origin,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      output += chunk.toString();
    });

    try {
      const searchHtml = await fetchBuiltRoute(origin, "/search/", child, () => output);
      const enSearchHtml = await fetchBuiltRoute(origin, "/en/search/", child, () => output);
      const loginHtml = await fetchBuiltRoute(origin, "/login/", child, () => output);

      expect(metaContent(searchHtml, "robots")).toBe("noindex,follow");
      expect(metaContent(enSearchHtml, "robots")).toBe("noindex,follow");
      expect(metaContent(loginHtml, "robots")).toBe("noindex,follow");

      expect(enSearchHtml).toMatch(/<h1\b[^>]*>\s*Search\s*<\/h1>/);
      expect(enSearchHtml).toContain('action="/en/search/"');
      expect(enSearchHtml).toContain('placeholder="Search…"');
      expect(enSearchHtml).toContain('aria-label="Search query"');
      expect(enSearchHtml).toContain("Enter a query or press");
    } finally {
      await stopServer(child);
    }
  });
});
