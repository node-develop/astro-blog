import { graphIds, websiteId, type Locale } from "./nodes-global";

const inLang = (locale: Locale): "ru-RU" | "en-US" => (locale === "ru" ? "ru-RU" : "en-US");

/** One listed project: the URL of its page and the title shown in the list. */
export interface CollectionItem {
  readonly url: string;
  readonly name: string;
}

export interface CollectionPageInput {
  readonly locale: Locale;
  readonly canonical: string;
  readonly name: string;
  readonly description: string;
  readonly items: ReadonlyArray<CollectionItem>;
  /**
   * `@id` of the BreadcrumbList emitted on this same page. Required, not
   * derived from `canonical`: the index page shows a breadcrumb trail and
   * emits the node, so the CollectionPage must name it — and a caller that
   * emits no such node must not be able to point at one by accident.
   */
  readonly breadcrumbId: string;
  readonly primaryImageOfPage?: string;
}

export const buildCollectionPageNode = (input: CollectionPageInput) => ({
  "@type": "CollectionPage",
  "@id": `${input.canonical}#collection`,
  url: input.canonical,
  name: input.name,
  description: input.description,
  inLanguage: inLang(input.locale),
  isPartOf: { "@id": websiteId(input.locale) },
  author: { "@id": graphIds.person },
  breadcrumb: { "@id": input.breadcrumbId },
  // hasPart used to be a list of bare `{"@id": "…#creativework"}` references
  // to nodes that live on the project pages and are absent from this one, so
  // every part of the portfolio resolved to nothing. Each entry now carries
  // its own minimal node definition under the SAME `@id` the project page
  // uses for the full CreativeWork: the reference resolves inside this
  // graph, and a crawler that follows `url` finds the complete description.
  hasPart: input.items.map((item) => ({
    "@type": "CreativeWork",
    "@id": `${item.url}#creativework`,
    url: item.url,
    name: item.name,
  })),
  ...(input.primaryImageOfPage
    ? { primaryImageOfPage: { "@type": "ImageObject", url: input.primaryImageOfPage } }
    : {}),
});

export interface CreativeWorkInput {
  readonly locale: Locale;
  readonly canonical: string;
  readonly name: string;
  readonly description: string;
  readonly role: string;
  readonly datePublished: Date;
  readonly dateModified?: Date;
  readonly keywords: ReadonlyArray<string>;
  readonly url: string;
}

export const buildCreativeWorkNode = (input: CreativeWorkInput) => {
  const node: Record<string, unknown> = {
    "@type": "CreativeWork",
    "@id": `${input.canonical}#creativework`,
    name: input.name,
    description: input.description,
    url: input.url,
    inLanguage: inLang(input.locale),
    author: { "@id": graphIds.person },
    creator: { "@id": graphIds.person },
    contributor: input.role,
    // Reference the page's own WebPage/ItemPage node, the same way
    // BlogPosting does, so CreativeWork ↔ WebPage ↔ BreadcrumbList resolve
    // inside one graph instead of the work hanging on its own.
    mainEntityOfPage: { "@id": `${input.canonical}#webpage` },
    datePublished: input.datePublished.toISOString(),
  };
  if (input.dateModified) node.dateModified = input.dateModified.toISOString();
  if (input.keywords.length > 0) node.keywords = input.keywords.join(", ");
  return node;
};
