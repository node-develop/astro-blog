import rss from "@astrojs/rss";
import MarkdownIt from "markdown-it";
import { getOrderedPosts } from "~/lib/content/loader";
import { person } from "~/lib/seo/person";
import { t, type Locale } from "~/i18n";
import { canonicalInternalHref } from "~/lib/rehype/canonical-internal-links";

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
      .map((p) => ({
        title: p.entry.data.title,
        description: p.entry.data.description,
        pubDate: p.entry.data.pubDate,
        link: `${blogPrefix}/${p.entry.id.replace(/^en\//, "")}/`,
        // Frontmatter `author` defaults to person.name (see content schema);
        // fall back explicitly so an empty override can't blank the feed author.
        author: `${person.email} (${p.entry.data.author || person.name})`,
        categories: p.entry.data.tags,
        content: p.entry.body ? renderContent(p.entry.body) : undefined,
      })),
  });
};
