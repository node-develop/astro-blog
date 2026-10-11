/** Integrity/discovery check for the project adapters; reads only local files. */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, lstatSync, realpathSync } from "node:fs";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const manifest = JSON.parse(read("vendor/claude-blog/manifest.json"));
const capabilities = JSON.parse(read("docs/blog-framework/capabilities.json"));
const issues = [];
const assert = (condition, message) => {
  if (!condition) issues.push(message);
};
const inside = (path) => {
  const rel = relative(root, path);
  return rel !== ".." && !rel.startsWith(`..${sep}`);
};
const safePath = (path) =>
  typeof path === "string" &&
  !path.startsWith("/") &&
  !path.includes("\\") &&
  !path.split("/").some((p) => p === ".." || p === "");
const files = (directory) =>
  readdirSync(resolve(root, directory), { recursive: true, withFileTypes: true })
    .filter((x) => !x.isDirectory())
    .map((x) => relative(root, resolve(x.parentPath, x.name)).split(sep).join("/"));

assert(/^[a-f0-9]{40}$/.test(manifest.commit), "Invalid upstream pin");
assert(
  manifest.repository === "https://github.com/AgriciDaniel/claude-blog",
  "Unexpected upstream repository",
);
assert(
  new Set(manifest.inventory.map((x) => x.path)).size === manifest.inventory.length,
  "Duplicate inventory path",
);
for (const item of manifest.inventory) {
  if (!safePath(item.path)) {
    issues.push(`Unsafe inventory path ${item.path}`);
    continue;
  }
  if (item.path.startsWith("brain/")) {
    assert(
      item.target === null && Boolean(item.reason),
      `Restricted Brain file redistributed: ${item.path}`,
    );
    continue;
  }
  const target = `upstream/${item.path}.upstream`;
  assert(item.target === target, `Wrong inert path for ${item.path}`);
  try {
    const path = resolve(root, "vendor/claude-blog", target);
    const stat = lstatSync(path);
    assert(
      stat.isFile() && (stat.mode & 0o111) === 0,
      `Not a non-executable regular file: ${item.path}`,
    );
    const bytes = readFileSync(path);
    assert(
      bytes.length === item.bytes &&
        createHash("sha256").update(bytes).digest("hex") === item.sha256,
      `Upstream bytes changed: ${item.path}`,
    );
  } catch (error) {
    issues.push(`Missing snapshot ${item.path}: ${error.code ?? error.message}`);
  }
}
const expected = new Set(
  manifest.inventory.filter((x) => x.target).map((x) => `vendor/claude-blog/${x.target}`),
);
for (const path of files("vendor/claude-blog/upstream"))
  assert(expected.has(path), `Uninventoried snapshot file: ${path}`);
for (const name of ["LICENSE", "NOTICE"])
  assert(
    read(`vendor/claude-blog/${name}`) === read(`vendor/claude-blog/upstream/${name}.upstream`),
    `${name} differs from upstream`,
  );

const upstreamSkills = manifest.inventory
  .filter((x) => /^skills\/[^/]+\/SKILL\.md$/.test(x.path))
  .map((x) => x.path.split("/")[1])
  .sort();
const names = capabilities.map((x) => x.name).sort();
assert(
  JSON.stringify(names) === JSON.stringify(upstreamSkills),
  "Capability map does not cover exactly every upstream skill",
);
assert(
  names.length === 32 && new Set(names).size === names.length,
  "Expected 32 distinct skill adapters; review new upstream versions explicitly",
);
const activeMarkdown = [
  "AGENTS.md",
  "CLAUDE.md",
  ...files("docs/blog-framework").filter((x) => x.endsWith(".md") && !x.includes("/work/")),
];
for (const item of capabilities) {
  assert(
    ["implemented", "adapted", "deferred"].includes(item.status),
    `Missing status for ${item.name}`,
  );
  assert(item.steps.length >= 4 && Boolean(item.output), `No concrete workflow for ${item.name}`);
  assert(item.upstream === `skills/${item.name}/SKILL.md`, `Wrong provenance for ${item.name}`);
  for (const reference of item.references) {
    try {
      assert(
        safePath(reference) && lstatSync(resolve(root, reference)).isFile(),
        `Missing reference: ${reference}`,
      );
    } catch {
      issues.push(`Missing reference: ${reference}`);
    }
  }
  const canonical = `.agents/skills/${item.name}/SKILL.md`;
  const claude = `.claude/skills/${item.name}`;
  try {
    const source = read(canonical);
    assert(
      new RegExp(`^---\\nname: ${item.name}\\n`).test(source),
      `Wrong skill name/frontmatter: ${canonical}`,
    );
    assert(
      source.includes("description:") && source.includes("CONTRACT.md"),
      `Missing description/contract: ${canonical}`,
    );
    assert(
      realpathSync(resolve(root, claude)) === realpathSync(resolve(root, dirname(canonical))),
      `Claude/Codex adapter drift: ${item.name}`,
    );
    assert(inside(realpathSync(resolve(root, claude))), `Skill escapes repository: ${claude}`);
    activeMarkdown.push(canonical);
  } catch (error) {
    issues.push(`Broken registration ${item.name}: ${error.message}`);
  }
}
for (const item of manifest.inventory.filter((x) => /^agents\/blog-[^/]+\.md$/.test(x.path))) {
  const path = `.claude/${item.path}`;
  try {
    assert(read(path).includes("CONTRACT.md"), `Missing role contract: ${path}`);
    activeMarkdown.push(path);
  } catch {
    issues.push(`Missing role: ${path}`);
  }
}
// Only real Markdown links in active adapter docs; original upstream references
// retain their untouched relative links as historical data.
for (const path of activeMarkdown) {
  const source = read(path).replace(/```[\s\S]*?```/g, "");
  for (const match of source.matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (/^(?:https?:|mailto:|#)/.test(target) || target.includes("<")) continue;
    try {
      const resolved = realpathSync(
        resolve(root, dirname(path), decodeURIComponent(target.split("#")[0])),
      );
      assert(inside(resolved), `Reference escapes repository: ${path} -> ${target}`);
    } catch {
      issues.push(`Broken local reference: ${path} -> ${target}`);
    }
  }
}
if (issues.length) {
  process.stderr.write(issues.join("\n") + "\n");
  process.exitCode = 1;
} else
  process.stdout.write(
    `Framework OK: ${names.length} skills, 5 roles, ${expected.size} immutable files, ${manifest.inventory.length} inventoried paths.\n`,
  );
