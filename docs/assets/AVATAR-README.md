# Avatar assets

`public/avatar-512.png` is the canonical raster and stays exactly as-is:

- It is `Person.image` in `src/lib/seo/person.ts` — Google's Rich Results
  guidance for `Person.image` requires a raster of at least 112×112 px, so
  this file must remain a real (non-tiny) PNG at a stable, unhashed URL.
- It also feeds `src/lib/feeds/build-json-feed.ts` (`avatar: person.image`).

Do not delete or resize `avatar-512.png` in place. If the photo changes,
replace this file and re-run the generator below.

## Responsive ladder

`avatar-{64,128,288}.{webp,avif}` (6 files) are pre-generated, committed
variants used by `<picture>` markup in `Avatar.astro`, `HomeAuthorCard.astro`,
and `AuthorCard.astro` so the browser never has to download the full 512×500
PNG (228 KB) to paint a 32–144 px circle.

Coverage by rendered CSS box × device pixel ratio:

| Rendered size                            | @1x source | @2x source |
| ---------------------------------------- | ---------- | ---------- |
| 32px (Avatar sm, PostLayout byline)      | 64         | 128        |
| 48px (mobile HomeAuthorCard/AuthorCard)  | 64         | 128        |
| 56px (AuthorCard desktop)                | 64         | 128        |
| 64px (Avatar md, HomeAuthorCard desktop) | 64         | 128        |
| 144px (Avatar lg)                        | 128        | 288        |

## Regenerating

```
pnpm assets:avatar
```

Runs `scripts/generate-avatar.ts` (sharp, `fit: "cover"`, `position:
"attention"`, WebP quality 82, AVIF quality 55/effort 6). The script is
idempotent — it skips a target whose mtime is already newer than the
source. These files are **committed to git**, not produced during the
Docker build; there is no sharp dependency in the production image.

## Housekeeping note

`public/avatar.jpg` has zero references in `src/`, `tests/`, or `docs/`
(verified by grep). It looks like a leftover from an earlier avatar
implementation and is a candidate for deletion — do that in its own
commit, not bundled with this asset ladder.
