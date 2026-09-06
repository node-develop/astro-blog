import { resolve, sep } from "node:path";

export const POSTS_DIR = resolve(process.cwd(), "src/content/posts");
export const SITE_DIR = resolve(process.cwd(), "src/content/site");
/**
 * Where `/admin/media` writes files. In dev this is `public/uploads` (Vite
 * serves it); in the Docker runner only `dist/client` is served, so the image
 * sets `UPLOADS_DIR=/app/dist/client/uploads` and mounts a volume there.
 */
export const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? resolve(process.env.UPLOADS_DIR)
  : resolve(process.cwd(), "public/uploads");

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
