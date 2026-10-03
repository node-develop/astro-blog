import type { APIRoute } from "astro";
import { workerHealth, workerHeartbeat, workerSecretFromEnv } from "~/lib/content-api/heartbeat";

export const prerender = false;

// Docker healthcheck target. 503 only when the publication worker is enabled
// (CONTENT_WORKER_SECRET set) and has been silent for too long; never depends
// on the database.
export const GET: APIRoute = () => {
  const { startedAt, lastTickAt } = workerHeartbeat.read();
  const status = workerHealth({
    enabled: workerSecretFromEnv() !== null,
    startedAt,
    lastTickAt,
    now: Date.now(),
  });
  return new Response(
    JSON.stringify({
      commit: process.env.GIT_SHA ?? "unknown",
      builtAt: process.env.BUILT_AT ?? "unknown",
      node: process.version,
      worker: {
        status,
        lastTickAt: lastTickAt === null ? null : new Date(lastTickAt).toISOString(),
      },
    }),
    {
      status: status === "stale" ? 503 : 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    },
  );
};
