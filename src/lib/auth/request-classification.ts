import { hasSessionCookie } from "~/lib/http/session-cookie";

const isPathWithin = (pathname: string, root: string): boolean =>
  pathname === root || pathname.startsWith(`${root}/`);

export const requiresAuthContext = (request: Request, pathname: string): boolean => {
  if (request.method !== "GET" && request.method !== "HEAD") return true;
  if (
    isPathWithin(pathname, "/admin") ||
    isPathWithin(pathname, "/login") ||
    isPathWithin(pathname, "/api/auth") ||
    isPathWithin(pathname, "/_actions")
  ) {
    return true;
  }
  return hasSessionCookie(request.headers.get("cookie"));
};

const HOST_CHARACTERS = /^(?:\[[0-9a-f:.]+\]|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::[0-9]{1,5})?$/i;

const parseHost = (value: string | null): URL | null => {
  const candidate = value?.trim();
  if (!candidate || !HOST_CHARACTERS.test(candidate)) return null;

  try {
    return new URL(`http://${candidate}`);
  } catch {
    return null;
  }
};

export const canonicalHostRedirect = (request: Request): URL | null => {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0] ?? null;
  const host = parseHost(forwardedHost) ?? parseHost(request.headers.get("host"));
  if (host?.hostname.toLowerCase() !== "www.artka.dev") return null;

  const source = new URL(request.url);
  const target = new URL("https://artka.dev");
  target.pathname = source.pathname;
  target.search = source.search;
  return target;
};
