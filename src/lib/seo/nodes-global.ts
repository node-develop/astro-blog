import { person } from "./person";
import { CANONICAL_ORIGIN, canonicalUrl } from "./url-policy";

export type Locale = "ru" | "en";

const SITE = CANONICAL_ORIGIN;

// One WebSite node per locale. A single shared `#website` @id used to be
// emitted with conflicting `inLanguage`/`description` values depending on
// which page a crawler happened to fetch first, so the two locales are now
// distinct entities linked through workTranslation/translationOfWork.
export const graphIds = {
  person: `${SITE}/#person`,
  organization: `${SITE}/#brand`,
  website: `${SITE}/#website`,
  websiteRu: `${SITE}/#website`,
  websiteEn: `${SITE}/#website-en`,
  blogRu: `${SITE}/#blog-ru`,
  blogEn: `${SITE}/#blog-en`,
} as const;

export const websiteId = (locale: Locale): string =>
  locale === "ru" ? graphIds.websiteRu : graphIds.websiteEn;

const inLang = (locale: Locale): "ru-RU" | "en-US" => (locale === "ru" ? "ru-RU" : "en-US");

export const buildPersonNode = () => {
  const merged = Array.from(new Set<string>([...person.knowsAbout, ...person.expertiseAreas]));
  return {
    "@type": "Person",
    "@id": graphIds.person,
    name: person.name,
    alternateName: person.alternateName,
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
  alternateName: ["artka.dev by Artyom Kashuta", "artka.dev by Артём Кашута"],
  description:
    "Bilingual technical publication by Artyom Kashuta about Claude Code internals, AI agent engineering, RAG, and production backend systems.",
  url: canonicalUrl("/"),
  email: person.email,
  logo: {
    "@type": "ImageObject",
    url: `${SITE}/icon-512.png`,
    width: 512,
    height: 512,
  },
  founder: { "@id": graphIds.person },
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "editorial and technical inquiries",
    email: person.email,
    url: canonicalUrl("/contact/"),
    availableLanguage: ["Russian", "English"],
  },
});

export const buildWebSiteNode = (locale: Locale) => ({
  "@type": "WebSite",
  "@id": websiteId(locale),
  url: canonicalUrl(locale === "ru" ? "/" : "/en/"),
  name: "artka.dev",
  alternateName: ["Artyom Kashuta technical blog", "Технический блог Артёма Кашуты"],
  description:
    locale === "ru"
      ? "Технические материалы Артёма Кашуты о Claude Code, AI-агентах, LLM, RAG и production backend."
      : "Technical writing by Artyom Kashuta about Claude Code, AI agents, LLMs, RAG, and production backend systems.",
  inLanguage: inLang(locale),
  publisher: { "@id": graphIds.organization },
  // RU is the source of truth; EN is its translation. Cross-link both ways so
  // either locale's graph resolves to the same publication.
  ...(locale === "ru"
    ? { workTranslation: { "@id": graphIds.websiteEn } }
    : { translationOfWork: { "@id": graphIds.websiteRu } }),
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
