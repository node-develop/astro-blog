# FAVICON / ICON SET — poster redesign

The mark is a heavy uppercase **A** drawn as two mitred strokes plus a
crossbar, on a full-bleed square. No rounded corners: the system is
`--radius-0` everywhere except the pill. Colours come from the poster
palette and are hard-coded here, because an icon file cannot read CSS
custom properties:

|                       | ground         | mark           |
| --------------------- | -------------- | -------------- |
| `favicon.svg` (light) | lime `#C2F000` | ink `#0B0B0B`  |
| `favicon-dark.svg`    | ink `#0B0B0B`  | lime `#CCFF00` |
| `icon-maskable.svg`   | lime `#C2F000` | ink `#0B0B0B`  |

`icon-maskable.svg` keeps the A inside the central 80% safe zone, so Android
can crop it to any silhouette without clipping the letter.

## Rasters — SHIPPED, and how they were made

Unlike the previous set, the PNG/ICO files are committed. Regenerate them
only when the SVGs change:

    npx sharp-cli -i public/favicon.svg      -o public/icon-16.png          resize 16 16
    npx sharp-cli -i public/favicon.svg      -o public/icon-32.png          resize 32 32
    npx sharp-cli -i public/icon-maskable.svg -o public/apple-touch-icon.png resize 180 180
    npx sharp-cli -i public/icon-maskable.svg -o public/icon-512.png         resize 512 512
    npx png-to-ico public/icon-32.png public/icon-16.png > public/favicon.ico

Note the split source: 16 and 32 come from `favicon.svg`, whose A fills the
square, because the maskable safe zone would shrink the letter to mush at
tab size. 180 and 512 come from `icon-maskable.svg`.

`apple-touch-icon.png` must stay opaque — iOS composites it on white and a
transparent PNG comes out as a white tile with a floating letter.

Files: `favicon.svg`, `favicon-dark.svg`, `icon-maskable.svg`, `icon-16.png`,
`icon-32.png`, `apple-touch-icon.png`, `icon-512.png`, `favicon.ico`.
Referenced from `src/layouts/BaseLayout.astro` and `public/site.webmanifest`;
the `mask-icon` colour there is the ultramarine accent `#2A1AE0`.
