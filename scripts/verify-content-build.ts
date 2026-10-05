import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkSnapshot, readJson, readManifest } from "../src/lib/content/snapshot";
import { verifyContentBuild } from "../src/lib/content/verify-build";

/**
 * Usage: verify-content-build <snapshot.json> <dist/client> [--expect-id <uuid>]
 *
 * Checks a finished build against the snapshot it was built from (the Dockerfile runs it between
 * `pnpm build` and the prod prune; CI gets the same check from tests/built/snapshot-build.test.ts).
 * --expect-id keeps CONTENT_SNAPSHOT_ID (served as contentSnapshotId) consistent with the file when
 * the build-arg is set by hand; in CI the id comes from the same file, so there it is a tautology.
 * Exit codes: 0 ok, 1 mismatch or error, 2 usage.
 */

type Args = Readonly<
  { snapshot: string; dist: string; expectId: string | undefined } | { usage: string }
>;

const parseArgs = (argv: readonly string[]): Args => {
  const rest = argv[0] === "--" ? argv.slice(1) : argv;
  const positional: string[] = [];
  let expectId: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] as string;
    if (arg === "--expect-id") {
      expectId = rest[++i];
      if (!expectId) return { usage: "--expect-id needs a value" };
    } else if (arg.startsWith("-")) return { usage: `unknown option ${arg}` };
    else positional.push(arg);
  }
  const [snapshot, dist, ...extra] = positional;
  if (!snapshot || !dist || extra.length > 0)
    return { usage: "expected <snapshot.json> <distClientDir>" };
  return { snapshot, dist, expectId };
};

const main = async (argv: readonly string[]): Promise<number> => {
  const args = parseArgs(argv);
  if ("usage" in args) {
    process.stderr.write(
      `usage: verify-content-build <snapshot.json> <distClientDir> [--expect-id <uuid>]: ${args.usage}\n`,
    );
    return 2;
  }
  const { minArticles } = await readManifest(process.cwd());
  const snapshot = checkSnapshot(await readJson(args.snapshot), minArticles, args.snapshot);
  const issues = [
    ...(args.expectId && args.expectId !== snapshot.snapshotId
      ? [`--expect-id ${args.expectId} differs from the file's snapshotId ${snapshot.snapshotId}`]
      : []),
    ...(await verifyContentBuild(snapshot, resolve(args.dist))),
  ];
  if (issues.length > 0) {
    process.stderr.write(
      `${issues.length} mismatches between ${args.snapshot} (snapshotId ${snapshot.snapshotId}) and ${args.dist}\n${issues.map((i) => `- ${i}\n`).join("")}`,
    );
    return 1;
  }
  process.stdout.write(
    `${snapshot.count} articles of snapshot ${snapshot.snapshotId} match ${args.dist}\n`,
  );
  return 0;
};

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(
        `verify-content-build failed: ${error instanceof Error ? error.message : error}\n`,
      );
      process.exitCode = 1;
    },
  );
}
