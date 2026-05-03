# AVATAR — drop-in instructions

The Avatar component (`src/components/Avatar.astro`) loads your photo
in this order:

1. /me.webp ← preferred (smallest, modern browsers)
2. /me.jpg ← fallback for older clients
3. /me-fallback.svg ← always shipped, sienna disc with «АК» monogram

To use your real photo: place TWO files in `public/`:

public/me.jpg — 288 × 288 px (2× retina for the lg variant)
public/me.webp — same image, WebP encoded

Optimization recipe (one-liner, requires `cwebp` and `imagemagick`):

# Start from any source image.jpg/png — square crop is cleanest.

convert source.jpg -resize 288x288^ -gravity center -extent 288x288 -strip -quality 88 public/me.jpg
cwebp -q 82 public/me.jpg -o public/me.webp

Or via `sharp-cli`:

npx sharp-cli -i source.jpg -o public/me.jpg resize 288 288 -- jpeg.quality 88
npx sharp-cli -i source.jpg -o public/me.webp resize 288 288 -- webp.quality 82

If you don't drop your photo in, the SVG monogram fallback will render
gracefully — no broken image icons.

Where the avatar appears (after this Phase 5 patch):

- /about — lg (144×144), framed, with sienna underline
- Header (optional — uncomment in Header.astro patch) — sm (32×32)
