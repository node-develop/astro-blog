/**
 * og-image — per-post Open Graph image generator.
 *
 * Strategy: build-time SSG via Astro endpoints. Each page that wants a
 * card emits a sibling `.png` rendered with Satori + @resvg/resvg-js.
 * No runtime dependency, no edge function.
 *
 * Image paths are ALWAYS locale-suffixed, so an EN page never inherits the
 * RU title. One builder per family owns its path shape — never inline the
 * template in a layout:
 *   - posts    → `postOgPath()`    in `./post-pages`    (/og/<slug>-<locale>.png)
 *   - landings → `landingOgPath()` in `./landing-pages` (/og/landing/<page>-<locale>.png)
 *   - lessons  → `lessonOgPath()`  in `./lesson-pages`  (/og/lesson/<course>/<lesson>-<locale>.png)
 *
 * The byline is NOT a free-form string: it defaults to the canonical author
 * from `~/lib/seo/person`. A hardcoded name here ships on every card of the
 * site at once and is invisible in the HTML, so `scripts/verify-seo-build.ts`
 * fails the build on any person-shaped string literal under `src/lib/og/`.
 *
 * Fonts live in `src/assets/og-fonts/` (build-only — never served publicly
 * from `public/`); the renderer needs the binary, not a CSS @font-face.
 * Every caller here runs at build time (SSG, no `prerender = false`), so the
 * font files never need to exist in the runtime Docker image.
 *
 * Layout: 1200×630, paper bg, sienna rule, Source Serif 4 title,
 * JetBrains Mono eyebrow, Inter byline. Follows Direction A.
 */
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { person } from "~/lib/seo/person";
import { OG_BRAND, OG_BRAND_UPPER } from "./brand";

export interface OgInput {
  readonly title: string;
  readonly eyebrow?: string; // e.g. "ESSAY · 2026" or category
  /**
   * Override for guest cards only. Omit it and the canonical author from
   * `~/lib/seo/person` is used — do not repeat a name literal here.
   */
  readonly byline?: string;
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
  const dir = join(root, "src", "assets", "og-fonts");
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

/**
 * Satori element tree of a card. Exported so the byline rule (default =
 * canonical author, override respected) is testable without rendering a PNG.
 */
export const ogTree = (input: OgInput): Record<string, unknown> => ({
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
                children: input.eyebrow ?? OG_BRAND_UPPER,
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
              props: { children: input.byline ?? person.name },
            },
            {
              type: "div",
              props: {
                style: {
                  fontFamily: "JetBrains Mono",
                  letterSpacing: "0.04em",
                  color: COLORS.fg,
                },
                children: OG_BRAND,
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
  const svg = await satori(ogTree(input) as never, {
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
