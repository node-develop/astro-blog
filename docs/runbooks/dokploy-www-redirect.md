# Dokploy: single-hop `www.artka.dev` → `artka.dev` redirect

Owner: whoever administers the Dokploy project for `artka.dev`
Applies to: the `Blog` application in Dokploy project `artka.dev - blog and personal site` (app name `blog-blog-xekukc`, image `ghcr.io/node-develop/astro-blog`), Traefik `v3.6.1` shipped by Dokploy
Status: **applied on 2026-09-19** via the Dokploy API; verified with one `301` hop from both `http://www` and `https://www`.

## Why

According to Google's data `www.artka.dev` answered 404 for a period (before the www domain was added to the application on 2026-08-18), and since then every `http://www.artka.dev/...` request took **two** hops to reach the canonical URL:

```
http://www.artka.dev/about/?x=1  -> 301 https://www.artka.dev/about/?x=1   (redirect-to-https)
https://www.artka.dev/about/?x=1 -> 301 https://artka.dev/about/?x=1       (Dokploy redirect #1)
```

Both hops came from router-level middlewares that Dokploy generates into `dynamic/blog-blog-xekukc.yml`. On the `web` router `redirect-to-https` is always first in the chain, so the www → apex rule (application → Advanced → Redirects, `^https?://www.(.+)`) could only ever fire on the second request. The order inside that file is Dokploy's and is regenerated on every domain edit, so it cannot be fixed there.

The target is one permanent redirect that keeps path and query:

```
http://www.artka.dev/$request_uri   -> 301 https://artka.dev/$request_uri
https://www.artka.dev/$request_uri  -> 301 https://artka.dev/$request_uri
```

## Preconditions (already true, check before re-applying elsewhere)

An entryPoint middleware only runs for requests that match **some** router on that entryPoint. If no router matches the host, Traefik answers 404 before any middleware is consulted. So `www.artka.dev` must exist as a routed host with a certificate:

- DNS: `www.artka.dev` is a `CNAME` to `artka.dev` (→ `46.202.129.150`).
- Dokploy: `www.artka.dev` is a second domain on the `Blog` application (HTTPS, Let's Encrypt), created 2026-08-18. Traefik serves a dedicated certificate with `CN=www.artka.dev`.

Do not delete that domain: without it the redirect below turns into a 404 and the certificate stops renewing.

## What is configured

Same two files as `dokploy-compression.md`, under `/etc/dokploy/traefik/`, edited through the API (`settings.updateMiddlewareTraefikConfig`, `settings.updateTraefikConfig`, then `settings.reloadTraefik`) or Dokploy → **Settings → Traefik**.

### 1. `dynamic/middlewares.yml` — middleware definition

Added next to `blog-compress`:

```yaml
http:
  middlewares:
    # blog-compress: ...
    www-to-apex:
      redirectRegex:
        regex: ^https?://www\.artka\.dev/([^.].*)?$
        replacement: https://artka.dev/${1}
        permanent: true
    # ...Dokploy-generated redirect-* middlewares follow...
```

This file is dynamic configuration: Traefik picks the change up within seconds, no reload needed.

### 2. `traefik.yml` — attach it at the entryPoint level, before compression

```yaml
entryPoints:
  web:
    address: :80
    http:
      middlewares:
        - www-to-apex@file
        - blog-compress@file
  websecure:
    address: :443
    http3:
      advertisedPort: 443
    http:
      tls:
        certResolver: letsencrypt
      middlewares:
        - www-to-apex@file
        - blog-compress@file
```

EntryPoint middlewares run **before** router middlewares, which is what collapses the two hops into one: on `web`, `www-to-apex` answers before `redirect-to-https` gets a chance.

`traefik.yml` is static configuration: save it, then **Settings → Traefik → Reload** (`settings.reloadTraefik`). Every service behind this Traefik drops for about 5 seconds.

**Order of operations matters.** Write `middlewares.yml` first, read it back, and only then reference `www-to-apex@file` from `traefik.yml`. An entryPoint that references a middleware the file provider does not define breaks every router on that entryPoint, including `console.artka.dev`, which is the API you would need for the rollback.

### Why the regex is `([^.].*)?$` and not `(.*)`

The first version used `^https?://www\.artka\.dev/(.*)`. It worked, and it also redirected `http://www.artka.dev/.well-known/acme-challenge/<token>`: entryPoint middlewares are prepended to Traefik's internal `acme-http` router too. Let's Encrypt validates the `www.artka.dev` certificate over exactly that path (`httpChallenge` on entryPoint `web`). It would have followed the redirect to `https://artka.dev/.well-known/acme-challenge/<token>`, where no ACME router exists (the challenge router lives only on `web`), received the blog's 404, and the next renewal of the www certificate would have failed silently about 30 days before expiry.

Traefik compiles `redirectRegex` with Go's RE2, which has no negative lookahead, so "everything except `/.well-known/acme-challenge/`" cannot be written directly. `([^.].*)?$` excludes every path whose first character is a dot. In practice that is only `/.well-known/*`:

- `http://www.artka.dev/.well-known/acme-challenge/*` is not matched, reaches the ACME handler (404 for an unknown token, as before the change).
- `https://www.artka.dev/.well-known/*` is not matched at the entryPoint but is still redirected to the apex in one hop by the Dokploy-generated router middleware (application → Advanced → Redirects, rule #1). Keep that rule; it is now the fallback for dot-paths.
- `http://www.artka.dev/.well-known/<anything else>` takes the old two-hop route. Accepted: nothing links there.

The group is optional so that the bare `http://www.artka.dev/` still matches; an unmatched group expands to an empty string, giving `https://artka.dev/`.

### Safety for the other services behind this Traefik

The entryPoint middleware runs for every host (`console.artka.dev`, `monitoring.tgapps.cloud`, `uptime.tgapps.cloud`), but `redirectRegex` is anchored on the literal host `www\.artka\.dev/`, so nothing else can match. Mailu publishes its own ports and has no Traefik domain.

## What did NOT work (do not retry)

- Fixing the hop order in `dynamic/blog-blog-xekukc.yml`. Dokploy owns that file, always emits `redirect-to-https` first on the `web` router, and regenerates it on any domain edit. See the same section in `dokploy-compression.md`.
- `regex: ^https?://www\.artka\.dev/(.*)`. Correct for users, breaks ACME renewal for the www certificate (above).
- Verifying with `curl -I`. `-I` sends `HEAD`, and Traefik's `redirectRegex` with `permanent: true` answers `301` only to `GET`; every other method gets `308`. `curl -I` therefore always prints `308 Permanent Redirect` here, before and after this change. Browsers and Googlebot send `GET` and see `301`. Verify with `GET` (below).

## Verify

```bash
# One hop, 301, path and query preserved, no certificate warning (ssl=0)
for u in 'http://www.artka.dev/about/?x=1' 'https://www.artka.dev/about/?x=1'; do
  curl -sS -o /dev/null -D - "$u" | grep -iE '^(HTTP|location)'
  curl -sS -o /dev/null -L -w 'hops=%{num_redirects} final=%{url_effective} ssl=%{ssl_verify_result}\n' "$u"
done
# expect: 301, location: https://artka.dev/about/?x=1, hops=1, ssl=0

# Apex is untouched — expect 200, no location
curl -sS -o /dev/null -D - 'https://artka.dev/about/' | grep -iE '^(HTTP|location)'

# ACME path must NOT be redirected — expect 404 and no location header
curl -sS -o /dev/null -D - 'http://www.artka.dev/.well-known/acme-challenge/probe' | grep -iE '^(HTTP|location)'

# Compression still on (GET, not HEAD) — expect content-encoding: br
curl -s -o /dev/null -D - -H 'Accept-Encoding: br, gzip' https://artka.dev/ | grep -i '^content-encoding'
```

Then:

- [ ] `https://console.artka.dev/` returns 200 and `http://console.artka.dev/` still 301s to https.
- [ ] `monitoring.tgapps.cloud` and `uptime.tgapps.cloud` answer the same as before the change. On 2026-09-19 both returned **404 on http and https before and after**; that is a pre-existing problem unrelated to this redirect.
- [ ] Dokploy redirects #2 and #3 still work: `https://artka.dev/blog/04-skills/` → `/courses/claude-code-guide/04-skills/`, `https://artka.dev/rss.xml/` → `/rss.xml`.
- [ ] After 2026-10-17 (30 days before the www certificate's `notAfter` of 2026-11-16), confirm the certificate renewed: `echo | openssl s_client -connect www.artka.dev:443 -servername www.artka.dev 2>/dev/null | openssl x509 -noout -dates`.

## Rollback

1. In `traefik.yml` remove both `- www-to-apex@file` lines, leaving `- blog-compress@file`. Save, reload Traefik.
2. Optionally remove the `www-to-apex` block from `dynamic/middlewares.yml`. Unreferenced, it is inert.

The Dokploy redirect rule #1 was left in place, so after a rollback www still reaches the apex, in two hops.

## Notes

- Dokploy rewrites `dynamic/middlewares.yml` when application redirects are added or removed. Whether hand-written entries survive such a rewrite has **not** been tested on this setup (all three Dokploy redirects predate `blog-compress`). If `www-to-apex` or `blog-compress` ever disappears while `traefik.yml` still references it, every router on both entryPoints breaks. After editing Redirects in the Dokploy UI, immediately re-read `middlewares.yml` and confirm both hand-written middlewares are still present.
- Nothing in this repository changes for the redirect. Canonical URLs, sitemap and RSS already use the apex via `CANONICAL_ORIGIN` in `src/lib/seo/url-policy.ts`.

## Related

- `docs/runbooks/dokploy-compression.md` — the other entryPoint-level middleware on the same Traefik; its `traefik.yml` snippet predates this change.
- `docs/runbooks/google-indexing-recovery.md` — Google indexing recovery for the same site.
