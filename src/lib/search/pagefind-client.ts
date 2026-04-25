/**
 * Lazy loader for the Pagefind browser bundle.
 *
 * The bundle is emitted by `pagefind` into `dist/client/pagefind/` after
 * `astro build` and served at the absolute URL `/pagefind/pagefind.js`.
 * Because the URL is absolute and the bundle is not a workspace dep, Vite's
 * import-analysis must skip it — hence the `@vite-ignore` comment.
 */
let pagefindPromise: Promise<PagefindApi> | null = null;

export function loadPagefind(): Promise<PagefindApi> {
  if (pagefindPromise) return pagefindPromise;
  // The URL is absolute and resolved by the browser at runtime — TS can't
  // statically locate it, hence the suppression. `@vite-ignore` keeps Vite's
  // import-analysis from trying to bundle it.
  pagefindPromise = (
    import(
      /* @vite-ignore */
      // @ts-expect-error — runtime-resolved absolute URL, no module type
      "/pagefind/pagefind.js"
    ) as Promise<PagefindApi>
  )
    .then((mod) => {
      window.__pagefind = mod;
      return mod;
    })
    .catch((err: unknown) => {
      pagefindPromise = null; // allow retry
      throw err;
    });
  return pagefindPromise;
}
