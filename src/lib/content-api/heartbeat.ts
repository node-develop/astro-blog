/**
 * Liveness of the publication worker, as seen by the server it calls.
 *
 * scripts/content-worker.mjs runs as a separate process and POSTs to
 * /api/v1/_worker/ every few seconds. That route records a tick here, and
 * /api/version (the Docker healthcheck) reads it: a container whose worker
 * died or cannot reach the server turns unhealthy instead of looking fine.
 * The state is per process and in memory on purpose: the healthcheck must not
 * depend on PostgreSQL.
 */
export type WorkerStatus = "disabled" | "ok" | "stale";

/** Worker request timeout (120 s) + its 5 s pause + margin. */
export const WORKER_MAX_SILENCE_MS = 180_000;

const MIN_SECRET_BYTES = 32;

/**
 * The worker is enabled only by a secret of at least 32 bytes; null otherwise.
 * Bytes, not characters: docker-entrypoint.sh measures the same variable with
 * `${#VAR}`, which counts bytes in dash, and scripts/content-worker.mjs does
 * the same. All three must agree, or a non-ASCII secret passes one check and
 * silently fails another.
 */
export const workerSecretFromEnv = (env: NodeJS.ProcessEnv = process.env): string | null => {
  const secret = env.CONTENT_WORKER_SECRET;
  return secret && Buffer.byteLength(secret, "utf8") >= MIN_SECRET_BYTES ? secret : null;
};

export interface WorkerHealthInput {
  readonly enabled: boolean;
  readonly startedAt: number;
  readonly lastTickAt: number | null;
  readonly now: number;
  readonly maxAgeMs?: number;
}

/** Before the first tick the silence is measured from process start. */
export const workerHealth = ({
  enabled,
  startedAt,
  lastTickAt,
  now,
  maxAgeMs = WORKER_MAX_SILENCE_MS,
}: WorkerHealthInput): WorkerStatus => {
  if (!enabled) return "disabled";
  return now - (lastTickAt ?? startedAt) > maxAgeMs ? "stale" : "ok";
};

export interface Heartbeat {
  readonly beat: () => void;
  readonly read: () => { readonly startedAt: number; readonly lastTickAt: number | null };
}

export const createHeartbeat = (now: () => number = Date.now): Heartbeat => {
  const startedAt = now();
  let lastTickAt: number | null = null;
  return {
    beat: () => {
      lastTickAt = now();
    },
    read: () => ({ startedAt, lastTickAt }),
  };
};

/** The one instance shared by the worker route and the version route. */
export const workerHeartbeat = createHeartbeat();
