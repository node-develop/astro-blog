# Dokploy: persistent volume for `/admin/media` uploads

Owner: whoever administers the Dokploy project for `artka.dev`
Applies to: the `astro-blog` application service (image `ghcr.io/node-develop/astro-blog`)

## Why

`/admin/media` writes files through `writeMediaToPublic(UPLOADS_DIR, …)` (`src/actions/media.ts` → `src/lib/fs/media-writer.ts`), and the DB row in `media_assets` stores only the relative path `YYYY/MM/<name>`. In production the `@astrojs/node` standalone adapter serves static files **only from `dist/client`**, so the only directory that is both writable at runtime and publicly reachable is `dist/client/uploads`. That is why the Dockerfile sets

```dockerfile
ENV UPLOADS_DIR=/app/dist/client/uploads
VOLUME ["/app/dist/client/uploads"]
```

Without a persistent mount, every redeploy (every push to `main`) replaces the container and its anonymous volume: the `media_assets` rows survive in Postgres, the files behind them do not, and every image inserted from the media library turns into a 404.

## Steps

- [ ] In Dokploy open the `astro-blog` application → **Advanced → Volumes / Mounts**.
- [ ] Add a mount of type **Volume**:
  - Volume name: `astro-blog-uploads` (any stable name; do not rename it later — the data lives under that name).
  - Mount path (inside the container): `/app/dist/client/uploads`.
- [ ] Do **not** use a bind mount to an arbitrary host directory unless it is owned by the container's `astro` user (uid from `useradd -r`): the runner drops privileges, and a root-owned host path makes every upload fail with `EACCES`. A named volume inherits the ownership set by `RUN mkdir -p … && chown astro:astro …` on first use.
- [ ] Redeploy the service (Dokploy → Deploy). The entrypoint does not touch the uploads directory; only the mount matters.
- [ ] Verify:
  1. Upload an image at `https://artka.dev/admin/media`.
  2. Open the returned URL `https://artka.dev/uploads/YYYY/MM/<name>` — expect `200`.
  3. Trigger one more redeploy (or push an empty commit) and open the same URL again — still `200`.
  4. `docker volume inspect astro-blog-uploads` on the host shows the files under `_data/YYYY/MM/`.

## Related

- `UPLOADS_DIR` env: see `.env.example` and `src/lib/fs/paths.ts` (dev default `public/uploads`).
- Volume backups: Dokploy → Volume Backups can snapshot the named volume to S3-compatible storage; treat uploads as user data, same as the Postgres dump.
- Single-replica note: the service must stay at one replica anyway (`docker-entrypoint.sh` runs migrations unguarded), so a local named volume is sufficient — no shared/NFS storage needed.
