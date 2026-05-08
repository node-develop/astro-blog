import { graphIds, type Locale } from "./nodes-global";

const SITE = "https://artka.dev";
const inLang = (locale: Locale): "ru-RU" | "en-US" => (locale === "ru" ? "ru-RU" : "en-US");

export interface BlogPostingInput {
  readonly locale: Locale;
  readonly canonical: string;
  readonly title: string;
  readonly description: string;
  readonly pubDate: Date;
  readonly updatedDate?: Date | null;
  readonly image: string;
  readonly keywords: ReadonlyArray<string>;
  readonly articleBody: string;
  readonly wordCount: number;
}

export const buildBlogPostingNode = (input: BlogPostingInput) => {
  const node: Record<string, unknown> = {
    "@type": "BlogPosting",
    "@id": `${input.canonical}#blogposting`,
    headline: input.title,
    description: input.description,
    datePublished: input.pubDate.toISOString(),
    dateModified: (input.updatedDate ?? input.pubDate).toISOString(),
    author: { "@id": graphIds.person },
    publisher: { "@id": graphIds.organization },
    image: input.image,
    mainEntityOfPage: input.canonical,
    inLanguage: inLang(input.locale),
    isPartOf: { "@id": input.locale === "ru" ? graphIds.blogRu : graphIds.blogEn },
    articleBody: input.articleBody,
    wordCount: input.wordCount,
  };
  if (input.keywords.length > 0) {
    node.keywords = input.keywords.join(", ");
  }
  return node;
};

export interface BreadcrumbInput {
  readonly locale: Locale;
  readonly blogIndexLabel: string;
  readonly title: string;
}

export const buildBreadcrumbListNode = (input: BreadcrumbInput) => {
  const homeUrl = input.locale === "ru" ? `${SITE}/` : `${SITE}/en/`;
  const blogUrl = input.locale === "ru" ? `${SITE}/blog` : `${SITE}/en/blog`;
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: input.locale === "ru" ? "Главная" : "Home",
        item: homeUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: input.blogIndexLabel,
        item: blogUrl,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: input.title,
      },
    ],
  };
};

export interface BreadcrumbItem {
  readonly name: string;
  readonly url?: string;
}

export interface BreadcrumbsInput {
  readonly canonical: string;
  readonly items: ReadonlyArray<BreadcrumbItem>;
}

// Generic BreadcrumbList builder — supersedes buildBreadcrumbListNode (which is
// post-specific and hardcodes the three-step Home → Blog → title shape).
// Keep BOTH symbols exported so PostLayout's existing call site doesn't move.
export const buildBreadcrumbsNode = (input: BreadcrumbsInput) => ({
  "@type": "BreadcrumbList",
  "@id": `${input.canonical}#breadcrumbs`,
  itemListElement: input.items.map((item, idx) => {
    const node: Record<string, unknown> = {
      "@type": "ListItem",
      position: idx + 1,
      name: item.name,
    };
    if (item.url) node.item = item.url;
    return node;
  }),
});

export type WebPageType = "WebPage" | "CollectionPage" | "ItemPage" | "AboutPage";

export interface WebPageInput {
  readonly locale: Locale;
  readonly canonical: string;
  readonly name: string;
  readonly description: string;
  readonly type?: WebPageType;
  readonly primaryImageOfPage?: string;
  readonly dateModified?: Date | null;
  readonly breadcrumbId?: string;
}

export const buildWebPageNode = (input: WebPageInput) => ({
  "@type": input.type ?? "WebPage",
  "@id": `${input.canonical}#webpage`,
  url: input.canonical,
  name: input.name,
  description: input.description,
  inLanguage: inLang(input.locale),
  isPartOf: { "@id": graphIds.website },
  about: { "@id": graphIds.person },
  ...(input.primaryImageOfPage
    ? { primaryImageOfPage: { "@type": "ImageObject", url: input.primaryImageOfPage } }
    : {}),
  ...(input.dateModified ? { dateModified: input.dateModified.toISOString() } : {}),
  ...(input.breadcrumbId ? { breadcrumb: { "@id": input.breadcrumbId } } : {}),
});

export interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

export interface FaqPageInput {
  readonly canonical: string;
  readonly items: ReadonlyArray<FaqItem>;
}

export const buildFaqPageNode = (input: FaqPageInput) => {
  if (input.items.length === 0) return null;
  return {
    "@type": "FAQPage",
    "@id": `${input.canonical}#faq`,
    mainEntity: input.items.map((it) => ({
      "@type": "Question",
      name: it.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: it.answer,
      },
    })),
  };
};
