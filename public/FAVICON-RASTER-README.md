# FAVICON RASTER ASSETS — TO BE GENERATED FROM phase-5/public/icon-maskable.svg

The PNG / ICO files are NOT shipped in this patch (binary blobs in a Git
patch are unreviewable). Generate them locally before deploying — one
command, one minute:

# Requires Inkscape OR rsvg-convert OR sharp-cli (npx).

# Pick whichever you have. The output paths are what BaseLayout expects.

# Option A — sharp-cli (no extra setup if you have node):

npx sharp-cli -i public/icon-maskable.svg -o public/icon-512.png resize 512 512
npx sharp-cli -i public/icon-maskable.svg -o public/apple-touch-icon.png resize 180 180
npx sharp-cli -i public/icon-maskable.svg -o public/icon-192.png resize 192 192
npx sharp-cli -i public/icon-maskable.svg -o public/icon-32.png resize 32 32
npx sharp-cli -i public/icon-maskable.svg -o public/icon-16.png resize 16 16

# Option B — Inkscape:

inkscape public/icon-maskable.svg -w 180 -h 180 -o public/apple-touch-icon.png
inkscape public/icon-maskable.svg -w 512 -h 512 -o public/icon-512.png

# …etc

# ICO bundle (legacy IE / older browsers; one file with multiple sizes):

npx png-to-ico public/icon-32.png public/icon-16.png > public/favicon.ico

If you want to skip the .ico (modern browsers don't need it), drop the
last command and remove the `<link rel="icon" type="image/x-icon">`
line from the BaseLayout patch.

After generation:
public/favicon.svg ← already shipped (light, theme-aware via prefers-color-scheme)
public/favicon-dark.svg ← already shipped
public/icon-maskable.svg ← already shipped (manifest)
public/icon-512.png ← from this script (manifest)
public/icon-192.png ← from this script (manifest, optional)
public/apple-touch-icon.png ← from this script (iOS Safari)
public/icon-32.png ← from this script (legacy fallback)
public/icon-16.png ← from this script (legacy fallback)
public/favicon.ico ← from this script (legacy fallback)
