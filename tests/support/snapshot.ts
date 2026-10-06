import { join } from "node:path";
import { it } from "vitest";
import type { ExportSnapshot } from "~/lib/content-api/contract";
import {
  checkSnapshot,
  FIXTURE_SNAPSHOT,
  readJson,
  readManifest,
  resolveSnapshotPath,
} from "~/lib/content/snapshot";

/**
 * The snapshot a `built` file is looking at, resolved exactly as the loader resolves it (so
 * CONTENT_SNAPSHOT has to be the same for `pnpm build` and for this run). `isFixture` is "the
 * snapshotId is the fixture's": a copy of the fixture counts, a release snapshot does not.
 *
 * Two kinds of check live in `tests/built`:
 *  - "for every article with X, the page does Y" runs on every corpus; the subjects come from
 *    `underTest.snapshot` through the predicates below. The fixture must contain a subject for
 *    each predicate, and `tests/unit/content/fixture-snapshot.test.ts` is the one place that says so.
 *  - a guard on the shape of the rendered corpus (a third-party cover exists, a tag has two
 *    posts) can be made false by an editorial action, so it uses `fixtureGuard` and shows up as
 *    skipped, with the reason in its name, on a release.
 */
const root = process.cwd();
const { minArticles } = await readManifest(root);
const path = resolveSnapshotPath(process.env, root);
const load = async (file: string): Promise<ExportSnapshot> =>
  checkSnapshot(await readJson(file), minArticles, file);
const snapshot = await load(path);
const fixtureId = (await load(join(root, FIXTURE_SNAPSHOT))).snapshotId;

export const underTest = {
  snapshot,
  path,
  isFixture: snapshot.snapshotId === fixtureId,
} as const;

export const fixtureGuard = (name: string, fn: () => void | Promise<void>): void => {
  it.skipIf(!underTest.isFixture)(
    `${name} [fixture-only guard${underTest.isFixture ? "" : `; skipped for ${path}`}]`,
    fn,
  );
};

export * from "./snapshot-subjects";
