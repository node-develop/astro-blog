import { statSync } from "node:fs";
import { resolveSafe, UPLOADS_DIR } from "../fs/paths";
import type { ArticleDocument } from "./contract";

type Cover = NonNullable<ArticleDocument["cover"]>;
/** The plain-URL form of a cover (`{url}`), or null for an asset cover or none. */
export const coverUrlOf = (cover: Cover | undefined): string | null =>
  cover && "url" in cover ? cover.url : null;

/** `/uploads/a/b.png` is served from UPLOADS_DIR (the same directory /admin/media writes to). */
export const uploadsFileExists = (path: string): boolean => {
  const relative = path.replace(/^\/uploads\//, "");
  try {
    return statSync(resolveSafe(UPLOADS_DIR, relative)).isFile();
  } catch (error) {
    // "Not there" is ENOENT/ENOTDIR or a path outside the directory. Anything else (EACCES, EIO,
    // an unmounted volume) is an operator problem: it propagates and is logged, not reported
    // to the client as a missing file.
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    if (error instanceof Error && error.message.startsWith("path traversal rejected")) return false;
    throw error;
  }
};

/** Raster only, like the `/uploads` branch of the schema: Rich Results reject SVG in BlogPosting.image. */
const RASTER_TYPE = /^image\/(?:png|jpeg|webp|avif|gif)\s*(?:;|$)/i;
const isImage = (response: Response): boolean =>
  response.ok && RASTER_TYPE.test(response.headers.get("content-type") ?? "");

/**
 * Probes an https cover before the page is committed. HEAD first; a server that refuses HEAD
 * (405/501) gets a one-byte ranged GET. No redirects and a timeout: the URL is client-supplied.
 */
export const probeImageUrl = async (url: string): Promise<boolean> => {
  const options = { redirect: "error", cache: "no-store" } as const;
  const head = await fetch(url, {
    ...options,
    method: "HEAD",
    signal: AbortSignal.timeout(10_000),
  });
  if (head.status !== 405 && head.status !== 501) return isImage(head);
  const ranged = await fetch(url, {
    ...options,
    headers: { range: "bytes=0-0" },
    signal: AbortSignal.timeout(10_000),
  });
  await ranged.body?.cancel();
  return isImage(ranged);
};
