import { person } from "./person";

export type Locale = "ru" | "en";

const SITE = "https://artka.dev";

export const graphIds = {
  person: `${SITE}/#person`,
  organization: `${SITE}/#brand`,
  website: `${SITE}/#website`,
  blogRu: `${SITE}/#blog-ru`,
  blogEn: `${SITE}/#blog-en`,
} as const;

const inLang = (locale: Locale): "ru-RU" | "en-US" => (locale === "ru" ? "ru-RU" : "en-US");

export const buildPersonNode = () => {
  const merged = Array.from(new Set<string>([...person.knowsAbout, ...person.expertiseAreas]));
  return {
    "@type": "Person",
    "@id": graphIds.person,
    name: person.name,
    url: person.url,
    image: person.image,
    jobTitle: person.jobTitle,
    description: person.description,
    knowsAbout: merged,
    sameAs: [...person.sameAs],
    email: person.email,
    subjectOf: person.notableWork.map((w) => ({
      "@type": "CreativeWork",
      name: w.title,
      url: w.url,
      description: w.description,
    })),
  };
};

export const buildOrganizationNode = () => ({
  "@type": "Organization",
  "@id": graphIds.organization,
  name: "artka.dev",
  url: SITE,
  logo: {
    "@type": "ImageObject",
    url: `${SITE}/favicon.svg`,
  },
  founder: { "@id": graphIds.person },
});

export const buildWebSiteNode = (locale: Locale) => ({
  "@type": "WebSite",
  "@id": graphIds.website,
  url: SITE,
  name: "artka.dev",
  inLanguage: inLang(locale),
  publisher: { "@id": graphIds.organization },
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE}/search?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
});

export const buildBlogNode = (locale: Locale) => ({
  "@type": "Blog",
  "@id": locale === "ru" ? graphIds.blogRu : graphIds.blogEn,
  url: locale === "ru" ? `${SITE}/blog` : `${SITE}/en/blog`,
  name: locale === "ru" ? "artka.dev — блог" : "artka.dev — blog",
  inLanguage: inLang(locale),
  author: { "@id": graphIds.person },
  publisher: { "@id": graphIds.organization },
});
