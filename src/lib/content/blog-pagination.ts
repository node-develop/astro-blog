/**
 * Blog index pagination for the lazy-loaded post grid.
 *
 * The index renders the first page server-side; older posts stream in
 * client-side from the `/blog/partials/<n>/` fragment routes as the
 * visitor scrolls. One constant so the index pages and the partial
 * routes can never disagree about slice boundaries.
 *
 * INDEXING: the partial routes are served with `X-Robots-Tag: noindex`
 * and there is no server-rendered link to page 2, so anything beyond the
 * first page is invisible to a crawler that does not run JS. Keep this
 * comfortably above the size of the archive: the whole archive must fit
 * on page one, and lazy loading stays as an escape hatch for the day it
 * does not. When the archive grows past this number, raise it (or add
 * real <a> links to the later pages) instead of letting posts fall off
 * the crawlable first page.
 */
export const BLOG_PAGE_SIZE = 24;
