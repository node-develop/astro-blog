import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "./lib/hash";
import { PATHS } from "./lib/site-config";

const main = async (): Promise<void> => {
  const ruFiles = (await readdir(PATHS.postsDir)).filter(
    (f) => /\.(md|mdx)$/.test(f) && !f.startsWith("."),
  );
  let updated = 0;
  for (const file of ruFiles) {
    const enPath = join(PATHS.postsEnDir, file);
    if (!existsSync(enPath)) continue;
    const ruSrc = await readFile(join(PATHS.postsDir, file), "utf8");
    const newHash = sha256(ruSrc);
    const enSrc = await readFile(enPath, "utf8");
    const next = enSrc.replace(/^sourceHash: [a-f0-9]+$/m, `sourceHash: ${newHash}`);
    if (next !== enSrc) {
      await writeFile(enPath, next, "utf8");
      updated++;
      console.warn(`updated sourceHash for ${file}`);
    }
  }
  console.warn(`\nDone: ${updated} EN file(s) updated`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
