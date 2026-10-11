/** Copy reviewed Git objects as inert bytes; never load or execute upstream code. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [source, commit] = process.argv.slice(2);
if (!source || !/^[a-f0-9]{40}$/.test(commit ?? "")) {
  throw new Error(
    "Usage: node scripts/blog-framework-vendor.mjs <reviewed-checkout> <full-commit>",
  );
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(root, "vendor/claude-blog");
if (existsSync(resolve(destination, "upstream"))) {
  throw new Error(
    "Snapshot already exists. Review and remove only vendor/claude-blog/upstream before updating.",
  );
}
const git = (...args) =>
  execFileSync("git", ["-C", resolve(source), ...args], { maxBuffer: 32 * 1024 * 1024 });
const identity = git("rev-parse", `${commit}^{commit}`).toString().trim();
if (identity !== commit) throw new Error("Commit did not resolve exactly");
const declaredVersion = JSON.parse(git("show", `${commit}:.claude-plugin/plugin.json`)).version;
if (
  typeof declaredVersion !== "string" ||
  !/^\d+\.\d+\.\d+(?:[-.][a-z0-9]+)*$/i.test(declaredVersion)
) {
  throw new Error("Unexpected upstream version; inspect before copying");
}
const releaseTagName = `v${declaredVersion}`;
let releaseTagCommit = null;
try {
  releaseTagCommit = git("rev-parse", "--verify", `refs/tags/${releaseTagName}^{commit}`)
    .toString()
    .trim();
} catch {
  // A shallow checkout may not have the release tag. Unknown is not the pinned commit.
}
const listing = git("ls-tree", "-rz", "--full-tree", commit).toString().split("\0").filter(Boolean);
const inventory = listing.map((entry) => {
  const match = /^(\d+) blob ([a-f0-9]+)\t(.+)$/.exec(entry);
  if (!match) throw new Error(`Unsupported tree entry: ${entry}`);
  const [, mode, , path] = match;
  if (
    !["100644", "100755"].includes(mode) ||
    path.startsWith("/") ||
    path.split("/").includes("..")
  ) {
    throw new Error(`Refusing non-regular or unsafe path: ${path}`);
  }
  const bytes = git("show", `${commit}:${path}`);
  const excluded = path.startsWith("brain/");
  const target = excluded ? null : `upstream/${path}.upstream`;
  if (target) {
    const out = resolve(destination, target);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, bytes, { mode: 0o644 });
  }
  return {
    path,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    target,
    ...(excluded
      ? { reason: "Separate Brain custom license reserves all rights; not redistributed." }
      : {}),
  };
});
mkdirSync(destination, { recursive: true });
for (const name of ["LICENSE", "NOTICE"])
  writeFileSync(resolve(destination, name), git("show", `${commit}:${name}`));
writeFileSync(
  resolve(destination, "manifest.json"),
  JSON.stringify(
    {
      repository: "https://github.com/AgriciDaniel/claude-blog",
      commit,
      declaredVersion,
      releaseTag: { name: releaseTagName, commit: releaseTagCommit },
      note: "Pinned source snapshot; compare commit with releaseTag rather than inferring a release from version. Original bytes; no upstream runtime activated.",
      inventory,
    },
    null,
    2,
  ) + "\n",
);
process.stdout.write(
  `Recorded ${inventory.length} files; copied ${inventory.filter((x) => x.target).length}; Brain excluded.\n`,
);
