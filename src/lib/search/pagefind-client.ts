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
  // The Pagefind bundle is emitted into `dist/client/pagefind/` by the
  // `pagefind` CLI after `astro build` and served at the absolute URL
  // `/pagefind/pagefind.js`. Rollup cannot resolve it at build time, and
  // `@vite-ignore` only quiets dev warnings — so we hide the import behind
  // `new Function()` to make it fully opaque to bundlers.
  const dynamicImport = new Function("url", "return import(url)") as (
    url: string,
  ) => Promise<PagefindApi>;
  pagefindPromise = dynamicImport("/pagefind/pagefind.js")
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
