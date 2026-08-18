export const CANONICAL_ORIGIN = "https://artka.dev";

export const isFileLikePath = (pathname: string): boolean =>
  /\/[^/?#]+\.[a-z0-9]{1,12}$/i.test(new URL(pathname, CANONICAL_ORIGIN).pathname);

export const canonicalPath = (pathname: string): string => {
  const parsed = new URL(pathname, CANONICAL_ORIGIN);
  const collapsed = parsed.pathname.replace(/\/{2,}/g, "/");
  if (collapsed === "/") return "/";
  const bare = collapsed.replace(/\/+$/, "");
  return isFileLikePath(bare) ? bare : `${bare}/`;
};

export const canonicalUrl = (pathname: string, site: string | URL = CANONICAL_ORIGIN): string =>
  new URL(canonicalPath(pathname), site).toString();
