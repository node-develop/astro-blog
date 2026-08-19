/**
 * Blog index pagination for the lazy-loaded post grid.
 *
 * The index renders the first page server-side; older posts stream in
 * client-side from the `/blog/partials/<n>/` fragment routes as the
 * visitor scrolls. One constant so the index pages and the partial
 * routes can never disagree about slice boundaries.
 */
export const BLOG_PAGE_SIZE = 4;
