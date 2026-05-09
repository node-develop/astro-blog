import { graphIds, type Locale } from "./nodes-global";

const inLang = (locale: Locale): "ru-RU" | "en-US" => (locale === "ru" ? "ru-RU" : "en-US");

export interface CollectionPageInput {
  readonly locale: Locale;
  readonly canonical: string;
  readonly name: string;
  readonly description: string;
  readonly itemUrls: ReadonlyArray<string>;
  readonly primaryImageOfPage?: string;
}

export const buildCollectionPageNode = (input: CollectionPageInput) => ({
  "@type": "CollectionPage",
  "@id": `${input.canonical}#collection`,
  url: input.canonical,
  name: input.name,
  description: input.description,
  inLanguage: inLang(input.locale),
  isPartOf: { "@id": graphIds.website },
  author: { "@id": graphIds.person },
  hasPart: input.itemUrls.map((u) => ({ "@id": `${u}#creativework` })),
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
    datePublished: input.datePublished.toISOString(),
  };
  if (input.dateModified) node.dateModified = input.dateModified.toISOString();
  if (input.keywords.length > 0) node.keywords = input.keywords.join(", ");
  return node;
};
