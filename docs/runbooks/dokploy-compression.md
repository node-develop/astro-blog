# Dokploy: response compression for `artka.dev`

Owner: whoever administers the Dokploy project for `artka.dev`
Applies to: the `Blog` application in Dokploy project `blog` (image `ghcr.io/node-develop/astro-blog`), Traefik `v3.6.1` shipped by Dokploy
Status: **applied on 2026-09-10** via the Dokploy API; verified with `content-encoding: br` on `/` and `/_astro/*.css`.

## Why

PageSpeed Insights (mobile, 2026-09) reported HTML (~24 KiB) and CSS (~100 KiB) delivered **uncompressed**. The `@astrojs/node` standalone adapter does not gzip or brotli its responses, and the Traefik instance that Dokploy runs in front of the container had no `compress` middleware. Text assets travelled at raw size; brotli brings CSS to roughly 15 % of raw and shortens the render-blocking chain more than any single code change in `perf/css-fonts-images`.

Compression is an infrastructure setting, **not** application code: the node adapter stays single-purpose and Traefik compresses everything it proxies (HTML, CSS, JS, SVG, JSON feeds, `llms.txt`) in one place.

## What is configured

Two files under Dokploy's Traefik directory (`/etc/dokploy/traefik/`), both editable in Dokploy → **Settings → Traefik** or through the API (`settings.readMiddlewareTraefikConfig` / `settings.updateMiddlewareTraefikConfig`, `settings.readTraefikConfig` / `settings.updateTraefikConfig`, then `settings.reloadTraefik`).

### 1. `dynamic/middlewares.yml` — middleware definition

```yaml
http:
  middlewares:
    blog-compress:
      compress:
        encodings:
          - br
          - zstd
          - gzip
        minResponseBodyBytes: 1024
        excludedContentTypes:
          - image/png
          - image/jpeg
          - image/webp
          - image/avif
          - image/gif
          - font/woff2
          - font/woff
          - video/mp4
    # ...Dokploy-generated redirect-* middlewares follow...
```

### 2. `traefik.yml` — attach it at the entryPoint level

```yaml
entryPoints:
  web:
    address: :80
    http:
      middlewares:
        - blog-compress@file
  websecure:
    address: :443
    http3:
      advertisedPort: 443
    http:
      tls:
        certResolver: letsencrypt
      middlewares:
        - blog-compress@file
```

Since 2026-09-19 both entryPoints also list `www-to-apex@file` **before** `blog-compress@file` (see `dokploy-www-redirect.md`). When restoring `traefik.yml` from this runbook, keep that line.

This is the approach documented in [Dokploy issue #3494](https://github.com/Dokploy/dokploy/issues/3494). The `@file` suffix is required because the middleware lives in the file provider. EntryPoint middlewares apply to **every** service behind this Traefik (console, monitoring, feedback API); compression is safe for all of them and images/fonts are excluded by content type.

`traefik.yml` is static configuration: after saving it, run **Settings → Traefik → Reload** (API: `settings.reloadTraefik`). The container restarts in a few seconds.

## What did NOT work (do not retry)

- Referencing `blog-compress` from the application's own routers in `dynamic/blog-blog-xekukc.yml` (Dokploy → application → Advanced → Traefik), with the definition either in that file or in `middlewares.yml`. The file was written to disk and read inside the Traefik container, and Traefik was reloaded, but neither `compress` nor a throwaway `headers` probe middleware ever showed up in responses. Router-level middleware edits to the per-application file do not take effect on this setup; the entryPoint-level attachment does. Dokploy also regenerates that file whenever a domain is edited, so anything hand-written there is lost.
- Verifying with `curl -I` (HEAD): Traefik does not compress a bodiless HEAD response, so the header is absent even when compression works. Use GET (below).

## Verify

```bash
# HTML (SSR) and a CSS chunk — expect "content-encoding: br" (or gzip if the client offers only gzip)
curl -s -o /dev/null -D - -H 'Accept-Encoding: br, gzip' https://artka.dev/ | grep -i '^content-encoding'
css=$(curl -s https://artka.dev/ | grep -o '_astro/[^"]*\.css' | head -1)
curl -s -o /dev/null -D - -H 'Accept-Encoding: br, gzip' "https://artka.dev/$css" | grep -iE '^(content-encoding|content-length)'

# Images must NOT be re-encoded — expect only content-length, no content-encoding
curl -s -o /dev/null -D - -H 'Accept-Encoding: br, gzip' https://artka.dev/avatar-512.png | grep -iE '^(content-encoding|content-length)'
```

Then:

- [ ] `vary: Accept-Encoding` is present on `/` (Traefik adds it).
- [ ] Re-run PageSpeed Insights mobile for `https://artka.dev/`: the "Enable text compression" diagnostic is gone and "Document request latency" no longer flags compression.
- [ ] `https://artka.dev/rss.xml`, `/feed.json`, `/llms.txt` still return 200 with a `content-encoding` header.
- [ ] `https://console.artka.dev/` still loads (it is behind the same entryPoint).

## Notes

- `minResponseBodyBytes: 1024` skips tiny responses (redirects, 404 bodies, small JSON) where CPU cost exceeds byte savings. Responses without `Content-Length` (streamed SSR HTML) are compressed regardless.
- Traefik `compress` does not skip images by content type on its own; without `excludedContentTypes` it would re-encode PNG/WebP to no benefit. A `content-encoding` header on `/avatar-512.png` means the exclusion list was dropped.
- Brotli and zstd need Traefik 3.x; Dokploy ships `traefik:v3.6.1`.
- Nothing in this repository changes for compression. `Dockerfile`, `astro.config.ts` and the node adapter stay as they are.

## Related

- `docs/runbooks/dokploy-uploads-volume.md` — same Dokploy application, persistent uploads volume.
- Branch `perf/css-fonts-images` — the code-side half of the same PSI audit (CSS, fonts, avatar).
