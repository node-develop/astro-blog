import { person } from "./person";
import { CANONICAL_ORIGIN, canonicalUrl } from "./url-policy";

export type Locale = "ru" | "en";

const SITE = CANONICAL_ORIGIN;

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
    url: canonicalUrl(person.url),
    image: person.image,
    jobTitle: person.jobTitle,
    description: person.description,
    knowsAbout: merged,
    sameAs: [...person.sameAs],
    email: person.email,
    subjectOf: person.notableWork.map((w) => ({
      "@type": "CreativeWork",
      name: w.title,
      url: canonicalUrl(w.url),
      description: w.description,
    })),
  };
};

export const buildOrganizationNode = () => ({
  "@type": "Organization",
  "@id": graphIds.organization,
  name: "artka.dev",
  url: canonicalUrl("/"),
  logo: {
    "@type": "ImageObject",
    url: `${SITE}/icon-512.png`,
    width: 512,
    height: 512,
  },
  founder: { "@id": graphIds.person },
});

export const buildWebSiteNode = (locale: Locale) => ({
  "@type": "WebSite",
  "@id": graphIds.website,
  url: canonicalUrl("/"),
  name: "artka.dev",
  inLanguage: inLang(locale),
  publisher: { "@id": graphIds.organization },
});

export const buildBlogNode = (locale: Locale) => ({
  "@type": "Blog",
  "@id": locale === "ru" ? graphIds.blogRu : graphIds.blogEn,
  url: canonicalUrl(locale === "ru" ? "/blog" : "/en/blog"),
  name: locale === "ru" ? "artka.dev — блог" : "artka.dev — blog",
  inLanguage: inLang(locale),
  author: { "@id": graphIds.person },
  publisher: { "@id": graphIds.organization },
});
