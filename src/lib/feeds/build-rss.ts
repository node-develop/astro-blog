import rss from "@astrojs/rss";
import MarkdownIt from "markdown-it";
import { getOrderedPosts } from "~/lib/content/loader";
import { person } from "~/lib/seo/person";
import { t, type Locale } from "~/i18n";
import { canonicalInternalHref } from "~/lib/rehype/canonical-internal-links";
import { imageTypeOf, postShareImage } from "~/lib/og/post-pages";

const parser = new MarkdownIt({ html: true, linkify: true, typographer: true });
const renderContent = (markdown: string): string =>
  parser
    .render(markdown)
    .replace(/(<a\b[^>]*\bhref=")([^"]+)(")/gi, (_match, before, href, after) =>
      [before, canonicalInternalHref(href), after].join(""),
    );

export interface BuildRssFeedParams {
  readonly site: URL | string;
  readonly locale: Locale;
}

export const buildRssFeed = async ({ site, locale }: BuildRssFeedParams) => {
  const posts = await getOrderedPosts({ locale });
  const lang = locale === "ru" ? "ru-RU" : "en-US";
  const blogPrefix = locale === "en" ? "/en/blog" : "/blog";
  const year = new Date().getFullYear();
  return rss({
    title: t(locale, "site.feedTitle"),
    description: t(locale, "site.feedDescription"),
    site,
    customData: `<language>${lang}</language><copyright>© ${year} artka.dev</copyright>`,
    items: [...posts]
      .sort((a, b) => b.entry.data.pubDate.getTime() - a.entry.data.pubDate.getTime())
      .map((p) => {
        const slug = p.entry.id.replace(/^en\//, "");
        const image = postShareImage(p.entry.data.cover, slug, locale, site);
        const imageType = imageTypeOf(image);
        return {
          title: p.entry.data.title,
          description: p.entry.data.description,
          pubDate: p.entry.data.pubDate,
          link: `${blogPrefix}/${slug}/`,
          // Frontmatter `author` defaults to person.name (see content schema);
          // fall back explicitly so an empty override can't blank the feed author.
          author: `${person.email} (${p.entry.data.author || person.name})`,
          categories: p.entry.data.tags,
          content: p.entry.body ? renderContent(p.entry.body) : undefined,
          // The post's cover, or its /og card. RSS requires a byte length; it is
          // not known for a remote cover, and 0 is the accepted "unknown".
          ...(imageType ? { enclosure: { url: image, length: 0, type: imageType } } : {}),
        };
      }),
  });
};
