import { it, expect } from "vitest";
import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";

it("the deployed supervisor sends a JSON POST accepted by Astro's origin check", async () => {
  const secret = "test-worker-secret-with-at-least-thirty-two-characters";
  const server = createServer();
  let child: ChildProcess | undefined;
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    const request = new Promise<{
      path: string | undefined;
      method: string | undefined;
      authorization: string | undefined;
      contentType: string | undefined;
    }>((resolve) => {
      server.once("request", (req, res) => {
        res.end('{"worked":false}');
        resolve({
          path: req.url,
          method: req.method,
          authorization: req.headers.authorization,
          contentType: req.headers["content-type"],
        });
      });
    });
    child = spawn(process.execPath, ["scripts/content-worker.mjs"], {
      env: { ...process.env, PORT: String(port), CONTENT_WORKER_SECRET: secret },
      stdio: "ignore",
    });
    expect(await request).toEqual({
      path: "/api/v1/_worker/",
      method: "POST",
      authorization: `Bearer ${secret}`,
      contentType: "application/json",
    });
  } finally {
    child?.kill("SIGTERM");
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
