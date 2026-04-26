import { mkdir, writeFile, access } from "node:fs/promises";
import { extname, basename } from "node:path";
import { randomBytes } from "node:crypto";
import { resolveSafe } from "./paths";

export function makeMediaSubpath(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}/${month}`;
}

function safeBaseName(original: string): string {
  const base = basename(original).replace(/[^a-zA-Z0-9._-]/g, "-");
  if (base.includes("..") || base.startsWith(".") || base === "") {
    throw new Error(`invalid filename: ${JSON.stringify(original)}`);
  }
  return base;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export interface WriteMediaResult {
  readonly relativePath: string;
  readonly absolutePath: string;
}

export async function writeMediaToPublic(
  baseDir: string,
  originalName: string,
  bytes: Uint8Array,
  when: Date = new Date(),
): Promise<WriteMediaResult> {
  if (originalName.includes("/") || originalName.includes("\\")) {
    throw new Error("filename must not contain path separators");
  }
  const base = safeBaseName(originalName);
  const sub = makeMediaSubpath(when);
  const dir = resolveSafe(baseDir, sub);
  await mkdir(dir, { recursive: true });

  let candidate = base;
  let absolutePath = resolveSafe(dir, candidate);
  while (await exists(absolutePath)) {
    const ext = extname(base);
    const stem = base.slice(0, base.length - ext.length);
    const suffix = randomBytes(3).toString("hex");
    candidate = `${stem}-${suffix}${ext}`;
    absolutePath = resolveSafe(dir, candidate);
  }

  await writeFile(absolutePath, bytes);
  return {
    relativePath: `${sub}/${candidate}`,
    absolutePath,
  };
}
