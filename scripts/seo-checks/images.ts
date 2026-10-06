import { attr, queryAll, type Dist } from "./dist";
import { grouped } from "./report";

const RULE = "images";
const FORMATS: ReadonlySet<string> = new Set(["webp", "avif", "png", "jpg", "jpeg", "svg", "gif"]);
/** Fractional values are legal: Mermaid SVGs are measured, e.g. width="572.5625". */
const DIMENSION = /^\d+(?:\.\d+)?$/;

const formatOf = (src: string): string | undefined => {
  const data = /^data:image\/([a-z0-9.+-]+)[;,]/i.exec(src);
  if (data !== null) return data[1]?.toLowerCase().replace(/\+xml$/, "");
  try {
    const pathname = new URL(src, "https://artka.dev").pathname;
    return /\.([a-z0-9]+)$/i.exec(pathname)?.[1]?.toLowerCase();
  } catch {
    return undefined;
  }
};

const isPositive = (value: string | undefined): boolean =>
  value !== undefined && DIMENSION.test(value) && Number(value) > 0;

const shorten = (src: string): string => (src.length > 80 ? `${src.slice(0, 77)}...` : src);

/**
 * Every image inside article prose (`.prose img`) carries what the reader and the layout need:
 * a non-empty `alt` (this is the accessibility rule for article images: html-validate's
 * `wcag/h37` only asks that the attribute exists), numeric `width` and `height` above zero so the
 * page does not shift when the image arrives, and a format a browser serves everywhere
 * (webp, avif, png, jpg, jpeg, svg, gif; the format is the MIME of a `data:` URL or the path
 * extension). Cover width has one home: the Content API gate `cover_too_narrow`.
 * Guard: at least one `.prose img` was seen (a renamed class would blind this check and the
 * per-image rules of `diagrams.ts`; lesson diagrams are always `.prose` images).
 */
export const checkImages = (dist: Dist): readonly string[] => {
  const findings: Array<readonly [string, string]> = [];
  let seen = 0;

  for (const page of dist.pages) {
    for (const img of queryAll(page, ".prose img")) {
      seen += 1;
      const src = attr(img, "src") ?? "";
      const where = `${page.route} ${shorten(src)}`;
      if ((attr(img, "alt") ?? "").trim() === "") {
        findings.push(["an image in article prose has no alt text", where]);
      }
      if (!isPositive(attr(img, "width")) || !isPositive(attr(img, "height"))) {
        findings.push(["an image in article prose has no numeric width and height", where]);
      }
      const format = formatOf(src);
      if (format === undefined || !FORMATS.has(format)) {
        findings.push([
          `an image in article prose has format ${JSON.stringify(format ?? null)}, expected one of ${[...FORMATS].join(", ")}`,
          where,
        ]);
      }
    }
  }

  const guard = seen > 0 ? [] : [`${RULE}: no \`.prose img\` in the build: nothing was checked`];
  return [...guard, ...grouped(RULE, findings)];
};
