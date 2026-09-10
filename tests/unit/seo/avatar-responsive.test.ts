// Guards the responsive avatar ladder (public/avatar-{64,128,288}.{webp,avif}):
// components must serve it via <picture>, never the raw 512px PNG, while
// src/lib/seo/person.ts and the JSON feed must keep pointing at the 512px
// raster (Google's Person.image ≥112x112 requirement).
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const COMPONENTS = [
  "src/components/Avatar.astro",
  "src/components/HomeAuthorCard.astro",
  "src/components/AuthorCard.astro",
] as const;

// PostLayout.astro is not a dedicated avatar component — it also renders a
// cover <img> and other markup that isn't part of the avatar ladder. Scope
// the assertions to just the byline-avatar anchor so those unrelated tags
// don't produce false failures/passes.
const SCOPED_TO_BYLINE_AVATAR = ["src/layouts/PostLayout.astro"] as const;

const readSource = (relPath: string): string => readFileSync(join(process.cwd(), relPath), "utf8");

const extractBylineAvatarAnchor = (source: string): string => {
  const start = source.search(/<a\b[^>]*class="post__byline-avatar"[^>]*>/);
  if (start === -1) {
    throw new Error("post__byline-avatar anchor not found");
  }
  const end = source.indexOf("</a>", start);
  if (end === -1) {
    throw new Error("closing </a> for post__byline-avatar anchor not found");
  }
  return source.slice(start, end + "</a>".length);
};

describe("responsive avatar markup", () => {
  for (const relPath of [...COMPONENTS, ...SCOPED_TO_BYLINE_AVATAR]) {
    describe(relPath, () => {
      const fullSource = readSource(relPath);
      const src = (SCOPED_TO_BYLINE_AVATAR as readonly string[]).includes(relPath)
        ? extractBylineAvatarAnchor(fullSource)
        : fullSource;

      it("does not point any <img> src at the 512px PNG or the raw person.image binding", () => {
        const imgTags = src.match(/<img\b[^>]*>/g) ?? [];
        expect(imgTags.length).toBeGreaterThan(0);
        for (const tag of imgTags) {
          expect(tag).not.toMatch(/avatar-512\.png/);
          expect(tag).not.toMatch(/person\.image/);
        }
      });

      it("has avif and webp <source> entries covering the 64/128/288 ladder with sizes", () => {
        const avifSource = src.match(/<source[^>]+type="image\/avif"[^>]*>/)?.[0];
        const webpSource = src.match(/<source[^>]+type="image\/webp"[^>]*>/)?.[0];
        expect(avifSource).toBeDefined();
        expect(webpSource).toBeDefined();
        for (const source of [avifSource!, webpSource!]) {
          expect(source).toMatch(/srcset="[^"]*64w[^"]*"/);
          expect(source).toMatch(/srcset="[^"]*128w[^"]*"/);
          expect(source).toMatch(/srcset="[^"]*288w[^"]*"/);
          expect(source).toMatch(/sizes=(["'][^"']+["']|\{[^}]+\})/);
        }
      });

      it("keeps explicit width/height on the <img> (no CLS regression)", () => {
        const imgTag = src.match(/<img\b[^>]*>/)?.[0] ?? "";
        expect(imgTag).toMatch(/width=/);
        expect(imgTag).toMatch(/height=/);
      });
    });
  }

  it("src/lib/seo/person.ts still references the 512px raster for Person.image", () => {
    const personSrc = readSource("src/lib/seo/person.ts");
    expect(personSrc).toMatch(/avatar-512\.png/);
  });

  it("the JSON feed still uses person.image (the 512px raster) for the avatar field", () => {
    const feedSrc = readSource("src/lib/feeds/build-json-feed.ts");
    expect(feedSrc).toMatch(/person\.image/);
  });
});

describe("generated avatar files", () => {
  const sizes = [64, 128, 288] as const;
  const formats = ["webp", "avif"] as const;

  for (const size of sizes) {
    for (const format of formats) {
      it(`public/avatar-${size}.${format} exists and is under 40 KB`, () => {
        const path = join(process.cwd(), `public/avatar-${size}.${format}`);
        expect(existsSync(path)).toBe(true);
        const { size: bytes } = statSync(path);
        expect(bytes).toBeGreaterThan(0);
        expect(bytes).toBeLessThan(40 * 1024);
      });
    }
  }
});
