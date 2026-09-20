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
 * Fonts live in `src/assets/og-fonts/` (never served publicly from
 * `public/`); the renderer needs the binary, not a CSS @font-face. Every
 * caller *here* runs at build time (SSG, no `prerender = false`). The same
 * four files are read at runtime by the one non-prerendered Satori route,
 * `/courses/<slug>/certificate.png`, which is why the Dockerfile copies that
 * directory into the runtime image.
 *
 * Layout: 1200×630 poster billboard — lime ground in a thick ink frame,
 * Unbounded title, Golos Text eyebrow and byline. The card is the article's
 * own header, reused at share size.
 *
 * Fontsource ships one file per subset, and satori needs the binary, so each
 * family is registered twice (latin + cyrillic) and referenced as a
 * `fontFamily` list. Satori walks that list per glyph, which is what keeps a
 * Russian title from rendering as tofu.
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
  readonly displayLatin: Buffer;
  readonly displayCyrillic: Buffer;
  readonly textLatin: Buffer;
  readonly textCyrillic: Buffer;
}

let fontCache: FontBuffers | null = null;

const loadFonts = async (): Promise<FontBuffers> => {
  if (fontCache) return fontCache;
  const root = process.cwd();
  const dir = join(root, "src", "assets", "og-fonts");
  fontCache = {
    displayLatin: await readFile(join(dir, "Unbounded-ExtraBold.ttf")),
    displayCyrillic: await readFile(join(dir, "Unbounded-ExtraBold-Cyrillic.ttf")),
    textLatin: await readFile(join(dir, "GolosText-Medium.ttf")),
    textCyrillic: await readFile(join(dir, "GolosText-Medium-Cyrillic.ttf")),
  };
  return fontCache;
};

// Poster palette — keep in sync with tokens.css. A card cannot read custom
// properties, so these are the only hard-coded colours in the system.
const COLORS = {
  fill: "#c2f000",
  ink: "#0b0b0b",
  inkMuted: "rgba(11, 11, 11, 0.72)",
} as const;

/**
 * Satori family identifiers. These are internal handles — the only contract
 * is that `fonts[].name` below matches what `fontFamily` asks for; nothing
 * here reaches the rendered card. So they are deliberately NOT spelled the
 * way the foundry spells them, with a space between two capitalised words:
 * that is exactly the shape scripts/verify-seo-build.ts fails the build on
 * under src/lib/og/, because the guard exists to stop a stranger's name
 * shipping on every social card. Hyphen and camel forms cost nothing and keep
 * the guard strict instead of widening its allowlist.
 */
const DISPLAY_FAMILY = "Unbounded, Unbounded-Cyr";
const TEXT_FAMILY = "GolosText, GolosText-Cyr";

/**
 * Satori implements no line-clamp and no auto-fit, so an over-long title
 * would simply run off the card. The size steps down with the character
 * count instead — the same approach the home masthead uses, for the same
 * reason: the copy is editor-supplied and cannot be trusted to be short.
 */
const titleSize = (title: string): string => {
  if (title.length <= 40) return "68px";
  if (title.length <= 72) return "54px";
  return "42px";
};

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
      background: COLORS.fill,
      border: `14px solid ${COLORS.ink}`,
      padding: "52px 60px",
      position: "relative",
      fontFamily: TEXT_FAMILY,
    },
    children: [
      // Slab marker + eyebrow
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "36px",
          },
          children: [
            {
              type: "div",
              props: {
                style: {
                  width: "40px",
                  height: "6px",
                  background: COLORS.ink,
                },
              },
            },
            {
              type: "div",
              props: {
                style: {
                  fontFamily: TEXT_FAMILY,
                  fontSize: "20px",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: COLORS.ink,
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
            fontFamily: DISPLAY_FAMILY,
            fontWeight: 800,
            fontSize: titleSize(input.title),
            lineHeight: 1.03,
            letterSpacing: "-0.03em",
            color: COLORS.ink,
            display: "flex",
            flex: "1 1 auto",
            alignItems: "flex-start",
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
            marginTop: "36px",
            paddingTop: "22px",
            borderTop: `4px solid ${COLORS.ink}`,
            fontFamily: TEXT_FAMILY,
            fontSize: "22px",
            color: COLORS.inkMuted,
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
                  fontFamily: DISPLAY_FAMILY,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  textTransform: "uppercase",
                  color: COLORS.ink,
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
      { name: "Unbounded", data: fonts.displayLatin, weight: 800, style: "normal" },
      { name: "Unbounded-Cyr", data: fonts.displayCyrillic, weight: 800, style: "normal" },
      { name: "GolosText", data: fonts.textLatin, weight: 500, style: "normal" },
      { name: "GolosText-Cyr", data: fonts.textCyrillic, weight: 500, style: "normal" },
    ],
  });
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
  });
  return resvg.render().asPng();
};
