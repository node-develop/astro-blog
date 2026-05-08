import MarkdownIt from "markdown-it";
import { getOrderedPosts } from "~/lib/content/loader";
import { person } from "~/lib/seo/person";
import { t, type Locale } from "~/i18n";

const parser = new MarkdownIt({ html: true, linkify: true, typographer: true });

export interface BuildJsonFeedParams {
  readonly site: URL | string;
  readonly locale: Locale;
}

interface JsonFeedAuthor {
  readonly name: string;
  readonly url: string;
  readonly avatar?: string;
}

interface JsonFeedItem {
  readonly id: string;
  readonly url: string;
  readonly title: string;
  readonly summary: string;
  readonly content_html?: string;
  readonly date_published: string;
  readonly tags: ReadonlyArray<string>;
  readonly authors: ReadonlyArray<JsonFeedAuthor>;
  readonly language: string;
}

interface JsonFeed {
  readonly version: "https://jsonfeed.org/version/1.1";
  readonly title: string;
  readonly description: string;
  readonly home_page_url: string;
  readonly feed_url: string;
  readonly language: string;
  readonly authors: ReadonlyArray<JsonFeedAuthor>;
  readonly icon?: string;
  readonly favicon?: string;
  readonly items: ReadonlyArray<JsonFeedItem>;
}

const stripTrailingSlash = (s: string): string => s.replace(/\/$/, "");

export const buildJsonFeed = async ({ site, locale }: BuildJsonFeedParams): Promise<Response> => {
  const posts = await getOrderedPosts({ locale });
  const lang = locale === "ru" ? "ru-RU" : "en-US";
  const baseUrl = stripTrailingSlash(typeof site === "string" ? site : site.toString());
  const blogPrefix = locale === "en" ? `${baseUrl}/en/blog` : `${baseUrl}/blog`;
  const homeUrl = locale === "en" ? `${baseUrl}/en/` : `${baseUrl}/`;
  const feedUrl = locale === "en" ? `${baseUrl}/en/feed.json` : `${baseUrl}/feed.json`;

  const author: JsonFeedAuthor = {
    name: person.name,
    url: person.url,
    avatar: person.image,
  };

  const feed: JsonFeed = {
    version: "https://jsonfeed.org/version/1.1",
    title: t(locale, "site.feedTitle"),
    description: t(locale, "site.feedDescription"),
    home_page_url: homeUrl,
    feed_url: feedUrl,
    language: lang,
    authors: [author],
    icon: `${baseUrl}/icon-512.png`,
    favicon: `${baseUrl}/favicon.svg`,
    items: [...posts]
      .sort((a, b) => b.entry.data.pubDate.getTime() - a.entry.data.pubDate.getTime())
      .map((p): JsonFeedItem => {
        const slug = p.entry.id.replace(/^en\//, "");
        const url = `${blogPrefix}/${slug}`;
        const base = {
          id: url,
          url,
          title: p.entry.data.title,
          summary: p.entry.data.description,
          date_published: p.entry.data.pubDate.toISOString(),
          tags: p.entry.data.tags ?? [],
          authors: [author],
          language: lang,
        } as const;
        return p.entry.body ? { ...base, content_html: parser.render(p.entry.body) } : base;
      }),
  };

  return new Response(JSON.stringify(feed, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/feed+json; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
    },
  });
};
