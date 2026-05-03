/**
 * og-image — per-post Open Graph image generator.
 *
 * Strategy: build-time SSG via Astro endpoints. Each post route
 * emits a sibling `.png` at `/og/<slug>.png` rendered with Satori +
 * @resvg/resvg-js. No runtime dependency, no edge function.
 *
 * Usage:
 *   1. pnpm add satori @resvg/resvg-js
 *   2. Drop `og-image.ts` into `src/lib/og/`.
 *   3. Drop the route file into `src/pages/og/[slug].png.ts`.
 *   4. In BaseHead.astro, set:
 *        <meta property="og:image" content={`${siteUrl}/og/${slug}.png`} />
 *        <meta name="twitter:image" content={`${siteUrl}/og/${slug}.png`} />
 *   5. Place font files in `public/fonts/og/` (or import from
 *      @fontsource-variable). The renderer needs the binary, not a
 *      CSS @font-face.
 *
 * Layout: 1200×630, paper bg, sienna rule, Source Serif 4 title,
 * JetBrains Mono eyebrow, Inter byline. Follows Direction A.
 */
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface OgInput {
  readonly title: string;
  readonly eyebrow?: string; // e.g. "ESSAY · 2026" or category
  readonly byline?: string; // e.g. "Artur Karapetov"
}

interface FontBuffers {
  readonly serifBold: Buffer;
  readonly mono: Buffer;
  readonly sans: Buffer;
}

let fontCache: FontBuffers | null = null;

const loadFonts = async (): Promise<FontBuffers> => {
  if (fontCache) return fontCache;
  const root = process.cwd();
  const dir = join(root, "public", "fonts", "og");
  fontCache = {
    serifBold: await readFile(join(dir, "SourceSerif4-SemiBold.ttf")),
    mono: await readFile(join(dir, "JetBrainsMono-Medium.ttf")),
    sans: await readFile(join(dir, "Inter-Regular.ttf")),
  };
  return fontCache;
};

// Direction A palette — keep in sync with tokens.css
const COLORS = {
  bg: "#f4efe6",
  fg: "#1c1916",
  fgMuted: "#5d574e",
  accent: "#c2410c",
  border: "#d6cdbf",
} as const;

const tree = (input: OgInput): Record<string, unknown> => ({
  type: "div",
  props: {
    style: {
      display: "flex",
      flexDirection: "column",
      width: "1200px",
      height: "630px",
      background: COLORS.bg,
      padding: "72px 80px",
      position: "relative",
      fontFamily: "Inter",
    },
    children: [
      // Top rule + eyebrow
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "40px",
          },
          children: [
            {
              type: "div",
              props: {
                style: {
                  width: "40px",
                  height: "2px",
                  background: COLORS.accent,
                },
              },
            },
            {
              type: "div",
              props: {
                style: {
                  fontFamily: "JetBrains Mono",
                  fontSize: "20px",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: COLORS.accent,
                  fontWeight: 500,
                },
                children: input.eyebrow ?? "ARTKA.DEV",
              },
            },
          ],
        },
      },
      // Title
      {
        type: "div",
        props: {
          style: {
            fontFamily: "Source Serif 4",
            fontWeight: 600,
            fontSize: "72px",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            color: COLORS.fg,
            display: "flex",
            flex: "1 1 auto",
            alignItems: "flex-start",
            // Satori does not implement CSS line-clamp; titles longer
            // than ~3 lines will overflow. Keep titles under ~80 chars.
          },
          children: input.title,
        },
      },
      // Bottom row: byline + brand
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginTop: "40px",
            paddingTop: "24px",
            borderTop: `1px solid ${COLORS.border}`,
            fontFamily: "Inter",
            fontSize: "22px",
            color: COLORS.fgMuted,
          },
          children: [
            {
              type: "div",
              props: { children: input.byline ?? "Artur Karapetov" },
            },
            {
              type: "div",
              props: {
                style: {
                  fontFamily: "JetBrains Mono",
                  letterSpacing: "0.04em",
                  color: COLORS.fg,
                },
                children: "artka.dev",
              },
            },
          ],
        },
      },
    ],
  },
});

export const renderOg = async (input: OgInput): Promise<Buffer> => {
  const fonts = await loadFonts();
  const svg = await satori(tree(input) as never, {
    width: 1200,
    height: 630,
    fonts: [
      { name: "Source Serif 4", data: fonts.serifBold, weight: 600, style: "normal" },
      { name: "JetBrains Mono", data: fonts.mono, weight: 500, style: "normal" },
      { name: "Inter", data: fonts.sans, weight: 400, style: "normal" },
    ],
  });
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
  });
  return resvg.render().asPng();
};
