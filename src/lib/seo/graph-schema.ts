import { z } from "zod";
import { graphIds, type Locale } from "./nodes-global";

/**
 * Runtime contract of the JSON-LD `@graph` a page emits. The builders in `nodes-*.ts` are the
 * generator, these schemas are the contract: `graph-schema.test.ts` keeps the builders inside it
 * without a build, and `scripts/seo-checks/jsonld.ts` applies the same function to every page of
 * `dist/client` (and the production smoke test to the server-rendered ones). Only the node types
 * that carry a promise are described; every other `@type` (WebPage, FAQPage, Course, ...) passes.
 * Schemas are loose objects: extra properties are the builders' business, missing ones are ours.
 * (schema-dts types were considered and not adopted: no runtime guarantee, huge unions.)
 */

const ref = z.looseObject({ "@id": z.url() });
const inLanguage = z.enum(["ru-RU", "en-US"]);
const nonEmpty = z.string().min(1);

const personSchema = z.looseObject({
  "@type": z.literal("Person"),
  "@id": z.url(),
  name: nonEmpty,
  url: z.url(),
  sameAs: z.array(z.url()).min(1),
});

const organizationSchema = z.looseObject({
  "@type": z.literal("Organization"),
  "@id": z.url(),
  name: nonEmpty,
  url: z.url(),
  logo: z.union([z.url(), z.looseObject({ url: z.url() })]),
});

const webSiteSchema = z.looseObject({
  "@type": z.literal("WebSite"),
  "@id": z.url(),
  url: z.url(),
  name: nonEmpty,
  inLanguage,
  publisher: ref,
});

const blogSchema = z.looseObject({
  "@type": z.literal("Blog"),
  "@id": z.url(),
  url: z.url(),
  name: nonEmpty,
  inLanguage,
});

const breadcrumbListSchema = z
  .looseObject({
    "@type": z.literal("BreadcrumbList"),
    "@id": z.url(),
    itemListElement: z
      .array(
        z.looseObject({
          position: z.int(),
          name: nonEmpty,
          item: z.url().optional(),
        }),
      )
      .min(1),
  })
  .superRefine((node, ctx) => {
    const items = node.itemListElement;
    items.forEach((entry, index) => {
      if (entry.position !== index + 1) {
        ctx.addIssue({
          code: "custom",
          path: ["itemListElement", index, "position"],
          message: `positions must run 1..n without gaps, got ${entry.position} at index ${index}`,
        });
      }
      if (index < items.length - 1 && entry.item === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["itemListElement", index, "item"],
          message: "only the last breadcrumb may omit `item`",
        });
      }
    });
  });

const blogPostingSchema = z.looseObject({
  "@type": z.literal("BlogPosting"),
  "@id": z.url(),
  url: z.url(),
  headline: nonEmpty,
  datePublished: z.iso.datetime(),
  dateModified: z.iso.datetime(),
  author: ref,
  publisher: ref,
  image: z.url(),
  inLanguage,
  mainEntityOfPage: ref,
  isPartOf: ref,
});

const SCHEMAS = {
  Person: personSchema,
  Organization: organizationSchema,
  WebSite: webSiteSchema,
  Blog: blogSchema,
  BreadcrumbList: breadcrumbListSchema,
  BlogPosting: blogPostingSchema,
} as const;

type KnownType = keyof typeof SCHEMAS;

const isKnownType = (type: unknown): type is KnownType =>
  typeof type === "string" && Object.hasOwn(SCHEMAS, type);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Objects of `type` anywhere in the value, nested ones included (an inline author counts). */
const countTyped = (value: unknown, type: string): number => {
  if (Array.isArray(value))
    return value.reduce<number>((sum, item) => sum + countTyped(item, type), 0);
  if (!isRecord(value)) return 0;
  const own =
    value["@type"] === type || (Array.isArray(value["@type"]) && value["@type"].includes(type));
  return Object.values(value).reduce<number>(
    (sum, item) => sum + countTyped(item, type),
    own ? 1 : 0,
  );
};

const localeTag = (locale: Locale): "ru-RU" | "en-US" => (locale === "ru" ? "ru-RU" : "en-US");

const refId = (value: unknown): string | undefined =>
  isRecord(value) && typeof value["@id"] === "string" ? value["@id"] : undefined;

export interface PageGraphInput {
  /** The `@graph` of ONE page, as parsed from its JSON-LD block. */
  readonly graph: ReadonlyArray<unknown>;
  readonly locale: Locale;
  /** Canonical URL of the page. */
  readonly canonical: string;
  /** A blog post page: it must carry exactly one BlogPosting and one BreadcrumbList. */
  readonly isPost: boolean;
}

/** Human-readable problems of one page's graph; empty means the graph keeps its promises. */
export const validatePageGraph = (input: PageGraphInput): readonly string[] => {
  const issues: string[] = [];
  const nodes = input.graph.filter(isRecord);
  const ofType = (type: string): ReadonlyArray<Readonly<Record<string, unknown>>> =>
    nodes.filter((node) => node["@type"] === type);

  for (const node of nodes) {
    const type = node["@type"];
    if (!isKnownType(type)) continue;
    const parsed = SCHEMAS[type].safeParse(node);
    if (parsed.success) continue;
    for (const issue of parsed.error.issues) {
      issues.push(
        `${type}${issue.path.map((key) => `.${String(key)}`).join("")}: ${issue.message}`,
      );
    }
  }

  const persons = ofType("Person");
  // One article is written by one person: the Person node of the graph, and no inline copy of it.
  const personCount = countTyped(input.graph, "Person");
  if (persons.length !== 1 || persons[0]?.["@id"] !== graphIds.person || personCount !== 1) {
    issues.push(
      `expected exactly one Person with @id ${graphIds.person}, found ${personCount} Person object(s)`,
    );
  }
  const organizations = ofType("Organization");
  if (organizations.length !== 1) {
    issues.push(`expected exactly one Organization, found ${organizations.length}`);
  }
  const sites = ofType("WebSite");
  if (sites.length !== 1) {
    issues.push(`expected exactly one WebSite, found ${sites.length}`);
  } else if (sites[0]?.["inLanguage"] !== localeTag(input.locale)) {
    issues.push(
      `WebSite.inLanguage is ${JSON.stringify(sites[0]?.["inLanguage"])}, the page is ${input.locale}`,
    );
  }

  if (!input.isPost) return issues;

  const postings = ofType("BlogPosting");
  if (postings.length !== 1) {
    issues.push(`expected exactly one BlogPosting, found ${postings.length}`);
  }
  const trails = ofType("BreadcrumbList");
  if (trails.length !== 1) {
    issues.push(`expected exactly one BreadcrumbList, found ${trails.length}`);
  }

  const posting = postings[0];
  if (posting === undefined) return issues;
  if (posting["url"] !== input.canonical) {
    issues.push(
      `BlogPosting.url is ${JSON.stringify(posting["url"])}, the canonical is ${input.canonical}`,
    );
  }
  if (posting["@id"] !== `${input.canonical}#blogposting`) {
    issues.push(`BlogPosting.@id is ${JSON.stringify(posting["@id"])}, not canonical#blogposting`);
  }
  if (posting["inLanguage"] !== localeTag(input.locale)) {
    issues.push(
      `BlogPosting.inLanguage is ${JSON.stringify(posting["inLanguage"])}, the page is ${input.locale}`,
    );
  }
  if (refId(posting["author"]) !== persons[0]?.["@id"]) {
    issues.push(
      `BlogPosting.author -> ${String(refId(posting["author"]))} is not the Person of this graph`,
    );
  }
  if (refId(posting["mainEntityOfPage"]) !== `${input.canonical}#webpage`) {
    issues.push(
      `BlogPosting.mainEntityOfPage -> ${String(refId(posting["mainEntityOfPage"]))}, expected canonical#webpage`,
    );
  }
  const published = Date.parse(String(posting["datePublished"]));
  const modified = Date.parse(String(posting["dateModified"]));
  if (Number.isFinite(published) && Number.isFinite(modified) && modified < published) {
    issues.push("BlogPosting.dateModified is earlier than datePublished");
  }
  return issues;
};
