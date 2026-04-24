import { resolve, sep } from "node:path";

export const POSTS_DIR = resolve(process.cwd(), "src/content/posts");
export const UPLOADS_DIR = resolve(process.cwd(), "public/uploads");

/**
 * Ensures the resolved path is within `base`. Throws on traversal attempts.
 */
export function resolveSafe(base: string, relative: string): string {
  const resolved = resolve(base, relative);
  const baseWithSep = base.endsWith(sep) ? base : base + sep;
  if (!resolved.startsWith(baseWithSep) && resolved !== base) {
    throw new Error(`path traversal rejected: ${relative}`);
  }
  return resolved;
}
