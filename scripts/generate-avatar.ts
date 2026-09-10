// scripts/generate-avatar.ts — pre-generate responsive avatar variants.
//
// Reads public/avatar-512.png (the canonical Person.image raster, kept as-is
// for Google's ≥112x112 Person.image requirement and the JSON feed) and
// writes a 64/128/288 WebP + AVIF ladder into public/ for use in <picture>
// markup. Committed output, not a build step — run with `pnpm assets:avatar`
// whenever the source photo changes.
//
// Idempotent: a target is skipped when it already exists, is non-empty, and
// its mtime is >= the source mtime.
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const SOURCE = join(process.cwd(), "public/avatar-512.png");
const SIZES = [64, 128, 288] as const;

interface Target {
  readonly size: number;
  readonly format: "webp" | "avif";
  readonly path: string;
}

const targets = (): ReadonlyArray<Target> =>
  SIZES.flatMap((size) =>
    (["webp", "avif"] as const).map((format) => ({
      size,
      format,
      path: join(process.cwd(), `public/avatar-${size}.${format}`),
    })),
  );

const shouldSkip = async (target: Target, sourceMtimeMs: number): Promise<boolean> => {
  if (!existsSync(target.path)) return false;
  const stats = await stat(target.path);
  if (stats.size === 0) return false;
  return stats.mtimeMs >= sourceMtimeMs;
};

const writeTarget = async (target: Target): Promise<void> => {
  const pipeline = sharp(SOURCE).resize(target.size, target.size, {
    fit: "cover",
    position: "attention",
  });
  if (target.format === "webp") {
    await pipeline.webp({ quality: 82 }).toFile(target.path);
  } else {
    await pipeline.avif({ quality: 55, effort: 6 }).toFile(target.path);
  }
};

const main = async (): Promise<void> => {
  if (!existsSync(SOURCE)) {
    console.error(`Source file not found: ${SOURCE}`);
    process.exit(1);
  }

  const sourceStat = await stat(SOURCE);
  const results: string[] = [];
  const failures: string[] = [];

  for (const target of targets()) {
    const rel = `public/avatar-${target.size}.${target.format}`;
    try {
      if (await shouldSkip(target, sourceStat.mtimeMs)) {
        results.push(`skip  ${rel} (up to date)`);
        continue;
      }
      await writeTarget(target);
      const written = await stat(target.path);
      results.push(`write ${rel} (${written.size} bytes)`);
    } catch (err) {
      failures.push(`${rel}: ${String(err)}`);
    }
  }

  console.warn(results.join("\n"));

  if (failures.length > 0) {
    for (const failure of failures) console.error(failure);
    process.exit(1);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
