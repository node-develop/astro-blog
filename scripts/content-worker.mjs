// Same-container supervisor calls the authenticated Astro worker route. All durable
// state and mutual exclusion live in PostgreSQL, never in this timer.
import { setTimeout as sleep } from "node:timers/promises";

const secret = process.env.CONTENT_WORKER_SECRET;
if (!secret || secret.length < 32) {
  console.error("CONTENT_WORKER_SECRET (at least 32 characters) is required");
  process.exit(1);
}
const url = `http://127.0.0.1:${process.env.PORT ?? 4321}/api/v1/_worker/`;
let stopped = false;
process.on("SIGTERM", () => {
  stopped = true;
});
process.on("SIGINT", () => {
  stopped = true;
});
while (!stopped) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) console.error(`Content worker HTTP ${response.status}`);
  } catch {
    console.error("Content worker could not reach the local site; retrying");
  }
  await sleep(5000);
}
