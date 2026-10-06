import { readFile } from "node:fs/promises";
import { join } from "node:path";
import probe from "probe-image-size/sync.js";
import { getCounterpart } from "../../src/lib/i18n/paths";
import { CANONICAL_ORIGIN } from "../../src/lib/seo/url-policy";
import { isRuntimeVolumePath } from "./on-demand";
import { isIndexable, localeOfRoute, meta, metaAll, type Dist, type Page } from "./dist";
import { grouped } from "./report";

const RULE = "social";
const PLACEHOLDER = "/og-default.png";
const MIN_WIDTH = 1200;
const MIN_HEIGHT = 630;

const COURSE_PAGE = /^courses\/[^/]+\/[^/]+\/index\.html$/;
const BLOG_PAGE = /^blog\/[^/]+\/index\.html$/;

/**
 * The social card of every page, read from the build:
 *
 *  1. exactly one absolute `og:image`;
 *  2. no indexable page falls back to the placeholder card;
 *  3. an image on this site is a file of the build, measured with probe-image-size: at least
 *     1200x630, and `og:image:width/height` say what the file really is (a hardcoded fallback in
 *     the layout would not). An image on another origin is not measured: there is no network here;
 *  4. an indexable page allows `max-image-preview:large` (an accepted literal check: the value
 *     comes from one layout line, kept as the guard carried over from the old diagram test);
 *  5. the two locales of a page do not share one card when both are ours.
 *
 * Guard, structural rather than a page count: the build has at least one lesson and one post.
 */
export const checkSocialMeta = async (dist: Dist): Promise<readonly string[]> => {
  const findings: Array<readonly [string, string]> = [];
  const byRoute = new Map<string, Page>(dist.pages.map((page) => [page.route, page]));
  const ownOrigin = new URL(CANONICAL_ORIGIN).origin;

  const ownImageOf = (page: Page): string | undefined => {
    const [src] = metaAll(page, "og:image");
    if (src === undefined) return undefined;
    const url = new URL(src, CANONICAL_ORIGIN);
    return url.origin === ownOrigin ? decodeURIComponent(url.pathname) : undefined;
  };

  for (const page of dist.pages) {
    const images = metaAll(page, "og:image");
    if (images.length !== 1) {
      findings.push([`expected exactly one og:image, found ${images.length}`, page.route]);
    }
    const src = images[0];
    const indexable = isIndexable(page);

    if (src !== undefined) {
      if (!/^https?:\/\//i.test(src)) {
        findings.push([`og:image ${src} is not an absolute URL`, page.route]);
      }
      if (indexable && src.includes(PLACEHOLDER)) {
        findings.push(["an indexable page uses the placeholder og card", page.route]);
      }
      const pathname = ownImageOf(page);
      if (pathname !== undefined && !isRuntimeVolumePath(pathname)) {
        const buffer = await readFile(join(dist.root, pathname)).catch(() => null);
        if (buffer === null) {
          findings.push([`og:image ${pathname} is not a file of the build`, page.route]);
        } else {
          const size = probe(buffer);
          if (size === null) {
            findings.push([`og:image ${pathname} is not a readable image`, page.route]);
          } else {
            if (size.width < MIN_WIDTH || size.height < MIN_HEIGHT) {
              findings.push([
                `og:image ${pathname} is ${size.width}x${size.height}, below ${MIN_WIDTH}x${MIN_HEIGHT}`,
                page.route,
              ]);
            }
            const declared = `${meta(page, "og:image:width")}x${meta(page, "og:image:height")}`;
            if (declared !== `${size.width}x${size.height}`) {
              findings.push([
                `og:image:width/height say ${declared}, the file is ${size.width}x${size.height}`,
                page.route,
              ]);
            }
          }
        }
      }
    }

    if (indexable && !(meta(page, "robots") ?? "").includes("max-image-preview:large")) {
      findings.push(["an indexable page does not allow max-image-preview:large", page.route]);
    }

    const twin = byRoute.get(getCounterpart(page.route, localeOfRoute(page.route)));
    const mine = ownImageOf(page);
    if (twin !== undefined && mine !== undefined && page.route < twin.route) {
      if (mine === ownImageOf(twin)) {
        findings.push([`shares its og card ${mine} with its twin ${twin.route}`, page.route]);
      }
    }
  }

  const guard =
    dist.pages.some(({ file }) => COURSE_PAGE.test(file)) &&
    dist.pages.some(({ file }) => BLOG_PAGE.test(file))
      ? []
      : [`${RULE}: the build has no lesson page or no post page: nothing meaningful was checked`];
  return [...guard, ...grouped(RULE, findings)];
};
