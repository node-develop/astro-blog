import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  checkSnapshot,
  readJson,
  readManifest,
  resolveSnapshotPath,
} from "../src/lib/content/snapshot";
import { startProductionServer, stopServer } from "../tests/support/production-server";
import { checkCiResult, lighthousePaths } from "./lighthouse/ci-result";

/**
 * Usage: lighthouse-pr (after `pnpm build`)
 *
 * Boots the standalone server the way the production smoke test does (service env masked, so
 * DATABASE_URL is empty), scans the home page, a RU post and its EN twin with Unlighthouse
 * against the budgets of unlighthouse.config.ts, then checks that every page really produced
 * numeric scores. Pull requests only: the numbers depend on the runner, so they never gate a
 * release. Exit codes: 0 ok, 1 budget or result failure.
 */

const CONFIG_FILE = "unlighthouse.config.ts";
const RESULT_FILE = resolve(process.cwd(), ".unlighthouse/ci-result.json");

const runUnlighthouse = async (origin: string, paths: readonly string[]): Promise<number> =>
  await new Promise((resolveExit, reject) => {
    const child = spawn(
      "pnpm",
      [
        "exec",
        "unlighthouse-ci",
        "--site",
        origin,
        "--urls",
        paths.join(","),
        "--config-file",
        CONFIG_FILE,
      ],
      { stdio: "inherit" },
    );
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });

const main = async (): Promise<number> => {
  const { minArticles } = await readManifest(process.cwd());
  const snapshotPath = resolveSnapshotPath(process.env, process.cwd());
  const snapshot = checkSnapshot(await readJson(snapshotPath), minArticles, snapshotPath);
  const paths = lighthousePaths(snapshot);

  // A stale report must never pass for this run's.
  await rm(RESULT_FILE, { force: true });

  const server = await startProductionServer({
    host: "127.0.0.1",
    siteUrl: "https://artka.dev",
    auth: "test",
  });
  try {
    const exitCode = await runUnlighthouse(server.origin, paths);
    const problems = checkCiResult(JSON.parse(await readFile(RESULT_FILE, "utf8")), paths);
    if (problems.length > 0) {
      process.stderr.write(
        `[lighthouse-pr] ${problems.length} problems with the scan\n${problems.map((p) => `- ${p}\n`).join("")}`,
      );
      return 1;
    }
    return exitCode;
  } finally {
    await stopServer(server.child);
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(
        `[lighthouse-pr] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
      process.exit(1);
    },
  );
}
