# Dokploy: one-week browser cache for unhashed static files on `artka.dev`

Owner: whoever administers the Dokploy project for `artka.dev`
Applies to: the `Blog` application in Dokploy project `artka.dev - blog and personal site` (app name `blog-blog-xekukc`, image `ghcr.io/node-develop/astro-blog`), Traefik `v3.6.1` shipped by Dokploy
Status: **applied on 2026-09-19** via the Dokploy API; verified with `cache-control: public, max-age=604800` on the covered paths and unchanged headers everywhere else.

## Why

Everything served from `public/` came back with `cache-control: public, max-age=0`: `/avatar-128.webp`, `/favicon.svg`, `/site.webmanifest`, `/pagefind/pagefind.js`, and so on. The `@astrojs/node` standalone adapter sets a long-lived cache only for `/_astro/` (hashed file names); every other static file gets `max-age=0`. The browser revalidates and receives `304`, so no bytes are re-downloaded, but every page view still costs several extra round trips (icons, manifest, avatar). On a mobile network with 150–250 ms latency that is noticeable.

This cannot be fixed in application code: the adapter serves `dist/client` with its own static handler **before** the app, so `src/middleware.ts` never sees these requests.

One week, not one year: the names carry no hash, so a replaced avatar or icon must reach returning visitors in a reasonable time.

## What is covered

| Covered (`max-age=604800`)                                    | Deliberately NOT covered                                                |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `/avatar-*` (`avatar-64/128/288.webp`, `.avif`, `-512.png`)   | HTML pages (`max-age=300, stale-while-revalidate=3600` from the app)    |
| `/icon-*` (`icon-16/32/512.png`, `icon-maskable.svg`)         | `/_astro/*` (already `max-age=31536000, immutable`)                     |
| `/favicon*` (`favicon.svg`, `favicon-dark.svg`, `favicon.ico`) | `/robots.txt`, `/sitemap-*.xml`, `/rss.xml`, `/feed.json` (`max-age=0`) |
| `/apple-touch-icon*`                                          | `/llms.txt`, `/llms-full.txt` (`max-age=3600`)                          |
| `/site.webmanifest`                                           | `/avatar.jpg`, `/og-default.*`, `/me-fallback.svg` (see Notes)          |
| `/pagefind/*`                                                 |                                                                         |
| `/humans.txt`                                                 |                                                                         |

## What is configured

One hand-written file, `/etc/dokploy/traefik/dynamic/blog-static-cache.yml`, created through the API (`settings.updateTraefikFile` with `path` and `traefikConfig`). It is dynamic configuration: Traefik picks it up within seconds, **no reload**, `traefik.yml` is untouched.

```yaml
# Hand-written, not managed by Dokploy. See docs/runbooks/dokploy-static-cache.md in the astro-blog repo.
http:
  middlewares:
    blog-static-cache:
      headers:
        customResponseHeaders:
          Cache-Control: "public, max-age=604800"
  routers:
    blog-static-cache:
      rule: "Host(`artka.dev`) && (PathPrefix(`/avatar-`) || PathPrefix(`/icon-`) || PathPrefix(`/favicon`) || PathPrefix(`/apple-touch-icon`) || Path(`/site.webmanifest`) || PathPrefix(`/pagefind/`) || Path(`/humans.txt`))"
      entryPoints:
        - websecure
      priority: 100
      middlewares:
        - blog-static-cache
      service: blog-static-cache
      tls:
        certResolver: letsencrypt
  services:
    blog-static-cache:
      loadBalancer:
        servers:
          - url: http://blog-blog-xekukc:4321
        passHostHeader: true
```

Design decisions:

- **A separate router, not an entryPoint middleware.** EntryPoint middlewares (`blog-compress`, `www-to-apex`) apply to every router of every service behind this Traefik, and Traefik's `headers` middleware has no path condition. Attached there, the header would land on HTML and on `console.artka.dev`. A router with a path rule and `priority: 100` takes only the listed paths (the main ``Host(`artka.dev`)`` router has the default priority, which is its rule length, 17).
- **A separate file, not Dokploy's files.** Dokploy regenerates `blog-blog-xekukc.yml` on every domain edit and rewrites `middlewares.yml` when application redirects change. It does not touch unknown files in `dynamic/`.
- **Its own service definition.** The Dokploy-generated service is named `blog-blog-xekukc-service-8`, where `8` is the domain's `uniqueConfigKey`; recreating the domain changes it and would orphan the router. The backend URL `http://blog-blog-xekukc:4321` depends only on the application name and port.
- **`websecure` only.** `http://artka.dev/...` is redirected to https by the main `web` router and `www.artka.dev` by `www-to-apex`, both in one hop, before this router matters.
- Compression still applies (it is on the entryPoint): `/pagefind/pagefind.js` returns `content-encoding: br` together with the new `cache-control`.

## What this tells us about "router-level middleware does not work here"

`dokploy-compression.md` records that a hand-written middleware referenced from the application's own routers in `blog-blog-xekukc.yml` never took effect. This change shows the limitation is **not** "router-level middlewares written by hand": a hand-written router with a hand-written `headers` middleware in a separate file worked on the first attempt. The earlier failure is specific to editing the Dokploy-owned per-application file (cause still unknown). For path- or host-specific behaviour, add a separate file with its own higher-priority router; for site-wide behaviour, use the entryPoint.

`dynamic/kuma-status-auth.yml` on the same server uses the same pattern. It currently proves nothing either way: the Docker service it references is not running, so Traefik drops that router and `uptime.tgapps.cloud` returns 404.

## Verify

```bash
for u in /avatar-128.webp /favicon.svg /site.webmanifest /pagefind/pagefind.js; do
  echo -n "$u  "; curl -s -o /dev/null -D - "https://artka.dev$u" | grep -i '^cache-control'
done
# expect max-age=604800

for u in / /robots.txt /sitemap-index.xml /blog/; do
  echo -n "$u  "; curl -s -o /dev/null -D - "https://artka.dev$u" | grep -i '^cache-control'
done
# must NOT be 604800: pages keep max-age=300 + stale-while-revalidate, service files keep max-age=0
```

Then:

- [ ] Bodies are intact: `curl -s -o /dev/null -w '%{http_code} %{content_type} %{size_download}\n' https://artka.dev/favicon.svg` → `200 image/svg+xml`, non-zero size.
- [ ] Conditional requests still return `304` (send the `etag` back in `If-None-Match`).
- [ ] `/_astro/*.css` still returns `max-age=31536000, immutable`.
- [ ] `curl -s -o /dev/null -D - -H 'Accept-Encoding: br, gzip' https://artka.dev/ | grep -i '^content-encoding'` → `br` (GET, not HEAD).
- [ ] `https://console.artka.dev/` returns 200; the www redirect from `dokploy-www-redirect.md` is still one hop.

## Rollback

The Dokploy API has no endpoint to delete a Traefik file, and `settings.updateTraefikFile` rejects an empty body. Neutralise the file by overwriting it with a comment:

```yaml
# disabled, see docs/runbooks/dokploy-static-cache.md
```

Traefik drops the router within seconds and the main router serves these paths again with `max-age=0`. Physically removing the file needs SSH: `rm /etc/dokploy/traefik/dynamic/blog-static-cache.yml`.

Browsers that already cached a file keep it for up to a week regardless of the rollback.

## Notes

- **`settings.updateTraefikFile` swallows write errors.** In Dokploy's `writeTraefikConfigInPath` the `fs.writeFileSync` call sits in a `try/catch` that only logs, and the endpoint returns `true` either way. Always read the file back with `settings.readTraefikFile` and diff it; the HTTP 200 proves nothing.
- **The header is set on every response of this router, including 404 and 304.** Traefik cannot condition a header on the status code. Before the change a 404 under these prefixes carried the app's `max-age=300`; now `https://artka.dev/icon-192.png` (no such file) is a 404 cached for a week. If an icon is ever added under a name that visitors previously got a 404 for, expect up to a week before they see it.
- **Pagefind is safe with a week.** `pagefind.js` requests `pagefind-entry.json` with a `?ts=` cache-busting query, and the index, fragment and `pf_meta` files it points to have hashed names, so a deploy does not break search for a returning visitor. The unhashed `pagefind.js`, UI bundles and wasm can lag by up to a week after a Pagefind version upgrade.
- **Replacing an avatar or icon in place** reaches returning visitors within a week. To force it sooner, change the file name and its references instead of overwriting.
- Left out on purpose: `/avatar.jpg` (the `/avatar-` prefix does not match it), `/og-default.png`, `/og-default.svg`, `/me-fallback.svg`. They are not part of the per-page request set (OG images are fetched by social crawlers). To cover one, add a `Path(...)` clause to the rule; nothing else changes.
- New files in `public/` whose names start with a covered prefix are cached for a week automatically. New HTML routes must not start with `/avatar-`, `/icon-`, `/favicon`, `/apple-touch-icon` or `/pagefind/`.
- Nothing in this repository changes for the cache header.

## Related

- `docs/runbooks/dokploy-compression.md` — entryPoint-level compression on the same Traefik.
- `docs/runbooks/dokploy-www-redirect.md` — entryPoint-level www → apex redirect, and the ACME caveat for entryPoint middlewares.
