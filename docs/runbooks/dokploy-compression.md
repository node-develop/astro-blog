# Dokploy: response compression for `artka.dev`

Owner: whoever administers the Dokploy project for `artka.dev`
Applies to: the `astro-blog` application service (image `ghcr.io/node-develop/astro-blog`)

## Why

PageSpeed Insights (mobile, 2026-09) reports HTML (~24 KiB) and CSS (~100 KiB) delivered **uncompressed**. The `@astrojs/node` standalone adapter does not gzip or brotli its responses, and the Traefik instance that Dokploy 0.29 runs in front of the container has no `compress` middleware attached to the router. Text assets therefore travel at raw size; gzip alone brings CSS to roughly 15 % of raw and shortens the render-blocking chain more than any single code change in `perf/css-fonts-images`.

Compression is an infrastructure setting. It is **not** in the application code, by design: the node adapter stays single-purpose, and Traefik compresses everything it proxies (HTML, CSS, JS, SVG, JSON feeds, `llms.txt`) in one place.

## What to add

Traefik `compress` middleware, attached to the HTTPS router of the application. Two ways to express it depending on how the service is defined in Dokploy.

### A. Application created from an image (current setup) — Traefik dynamic config

Dokploy manages applications through Traefik's **file provider**, one YAML per application. Edit it in Dokploy → application `astro-blog` → **Advanced → Traefik** (raw editor).

1. Note the existing router name under `http.routers` (Dokploy generates it, typically `<app>-<id>-web-secure`). Do not rename it.
2. Add the middleware and reference it from that router:

```yaml
http:
  middlewares:
    blog-compress:
      compress:
        minResponseBodyBytes: 1024
        # Traefik 3: brotli + zstd + gzip, negotiated via Accept-Encoding.
        # Leave `encodings` unset to accept the default list.
        # Traefik only skips responses that ALREADY carry a Content-Encoding
        # header — it does NOT skip images by content type on its own. List
        # the already-compressed formats explicitly (exact MIME strings;
        # excludedContentTypes does not support globs like `image/*`).
        # image/svg+xml is intentionally NOT excluded — it's text and
        # compresses well.
        excludedContentTypes:
          - image/png
          - image/jpeg
          - image/webp
          - image/avif
          - image/gif
          - font/woff2
          - font/woff
          - video/mp4
  routers:
    <existing-secure-router>:
      # ...keep rule / entryPoints / service / tls exactly as generated...
      middlewares:
        - blog-compress
```

If the router already lists middlewares (for example a redirect), **append** `blog-compress` to that list instead of replacing it.

3. Save. Dokploy writes the file; Traefik hot-reloads the file provider, no redeploy needed.

### B. Service defined in `docker-compose.yml` — labels

If the application is ever moved to a compose stack (the way the CMS branch does it), the equivalent labels on the `astro-blog` service are:

```yaml
labels:
  - traefik.enable=true
  - traefik.http.middlewares.blog-compress.compress=true
  - traefik.http.middlewares.blog-compress.compress.minresponsebodybytes=1024
  - traefik.http.middlewares.blog-compress.compress.excludedcontenttypes=image/png,image/jpeg,image/webp,image/avif,image/gif,font/woff2,font/woff,video/mp4
  # Attach to the existing HTTPS router of this service; the router name must
  # match the one declared in the `traefik.http.routers.<name>.rule` label.
  - traefik.http.routers.<existing-secure-router>.middlewares=blog-compress@docker
```

The `@docker` suffix is required when the middleware is declared through labels and referenced from a label-declared router.

## Verify

Run from any machine after the change (Traefik reloads within seconds):

```bash
curl -sI -H 'Accept-Encoding: br, gzip' https://artka.dev/ | grep -i content-encoding
curl -sI -H 'Accept-Encoding: br, gzip' "https://artka.dev/_astro/$(curl -s https://artka.dev/ | grep -o '_astro/[^"]*\.css' | head -1 | cut -d/ -f2)" | grep -i content-encoding
```

Expected: `content-encoding: br` (or `gzip` if the client offers only gzip) on both. Missing header means the middleware is not attached to the router that actually served the request; check the router name in step A.1.

Then:

- [ ] `curl -sI https://artka.dev/ | grep -i vary` shows `Vary: Accept-Encoding` (Traefik adds it).
- [ ] Re-run PageSpeed Insights mobile for `https://artka.dev/`: the "Enable text compression" diagnostic must disappear and "Document request latency" must no longer flag compression.
- [ ] Spot-check `https://artka.dev/rss.xml`, `/feed.json`, `/llms.txt` still return 200 with a `content-encoding` header.
- [ ] Spot-check `https://artka.dev/avatar-512.png` (or any image) is **not** re-encoded: `curl -sI -H 'Accept-Encoding: br, gzip' https://artka.dev/avatar-512.png | grep -i content-encoding` should print nothing. A `content-encoding` header on a PNG means the `excludedContentTypes` list above was not applied to the middleware actually serving the request — recompressing an already-compressed PNG wastes CPU for no size benefit.

## Notes

- `minResponseBodyBytes: 1024` avoids compressing tiny responses (redirects, 404 bodies, small JSON) where the CPU cost exceeds the byte savings.
- Brotli requires Traefik 3.x; Dokploy 0.29 ships Traefik 3. If only `gzip` ever appears in `content-encoding`, the Traefik version is older than expected — gzip alone is still the bulk of the win.
- Nothing in this repository changes for compression. `Dockerfile`, `astro.config.ts` and the node adapter stay as they are.

## Related

- `docs/runbooks/dokploy-uploads-volume.md` — same Dokploy application, persistent uploads volume.
- Branch `perf/css-fonts-images` — the code-side half of the same PSI audit (CSS, fonts, avatar).
