import { graphIds, websiteId, type Locale } from "./nodes-global";
import { canonicalUrl } from "./url-policy";

const inLang = (locale: Locale): "ru-RU" | "en-US" => (locale === "ru" ? "ru-RU" : "en-US");

/** ISO 8601 duration for a whole number of minutes: 12 → "PT12M", 90 → "PT1H30M". */
export const minutesToIsoDuration = (minutes: number): string | null => {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return `PT${hours > 0 ? `${hours}H` : ""}${rest > 0 || hours === 0 ? `${rest}M` : ""}`;
};

/**
 * Best-effort ISO 8601 duration from a human workload string such as
 * "~6 часов", "6 hours", "45 мин" or "1.5h". Returns null when no number +
 * recognisable unit is present — callers then simply omit the field.
 */
export const parseWorkloadToIsoDuration = (text: string | undefined): string | null => {
  if (!text) return null;
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*([a-zа-яё]+)/i);
  if (!match) return null;
  const amount = Number(match[1]!.replace(",", "."));
  const unit = match[2]!.toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (/^(h|hr|hrs|hour|hours|ч|час|часа|часов)$/.test(unit)) {
    return minutesToIsoDuration(amount * 60);
  }
  if (/^(m|min|mins|minute|minutes|мин|минут|минуты|минута)$/.test(unit)) {
    return minutesToIsoDuration(amount);
  }
  return null;
};

export interface BlogPostingInput {
  readonly locale: Locale;
  readonly canonical: string;
  readonly title: string;
  readonly description: string;
  readonly pubDate: Date;
  readonly updatedDate?: Date | null;
  readonly image: string;
  /** Authored semantic keywords (frontmatter `keywords`), NOT tag slugs. */
  readonly keywords: ReadonlyArray<string>;
  readonly articleBody: string;
  readonly wordCount: number;
  /** First tag — the section of the blog the post lives in. */
  readonly articleSection?: string;
  /** Reading time in minutes; emitted as ISO 8601 `timeRequired`. */
  readonly readingMinutes?: number;
}

export const buildBlogPostingNode = (input: BlogPostingInput) => {
  const node: Record<string, unknown> = {
    "@type": "BlogPosting",
    "@id": `${input.canonical}#blogposting`,
    url: input.canonical,
    headline: input.title,
    description: input.description,
    datePublished: input.pubDate.toISOString(),
    dateModified: (input.updatedDate ?? input.pubDate).toISOString(),
    author: { "@id": graphIds.person },
    publisher: { "@id": graphIds.organization },
    image: input.image,
    // Reference the page's own WebPage node instead of a bare URL string so
    // BlogPosting ↔ WebPage ↔ BreadcrumbList resolve inside one graph.
    mainEntityOfPage: { "@id": `${input.canonical}#webpage` },
    inLanguage: inLang(input.locale),
    isPartOf: { "@id": input.locale === "ru" ? graphIds.blogRu : graphIds.blogEn },
    isAccessibleForFree: true,
    articleBody: input.articleBody,
    wordCount: input.wordCount,
  };
  if (input.keywords.length > 0) {
    node.keywords = input.keywords.join(", ");
  }
  if (input.articleSection) {
    node.articleSection = input.articleSection;
  }
  const timeRequired =
    input.readingMinutes === undefined ? null : minutesToIsoDuration(input.readingMinutes);
  if (timeRequired) {
    node.timeRequired = timeRequired;
  }
  return node;
};

export interface BreadcrumbInput {
  readonly locale: Locale;
  readonly blogIndexLabel: string;
  readonly title: string;
}

/**
 * @deprecated Post-specific 3-step breadcrumb without an `@id`. PostLayout now
 * uses `buildBreadcrumbsNode` (generic, addressable via `#breadcrumbs`); this
 * builder is kept only until remaining call sites migrate.
 */
export const buildBreadcrumbListNode = (input: BreadcrumbInput) => {
  const homeUrl = canonicalUrl(input.locale === "ru" ? "/" : "/en/");
  const blogUrl = canonicalUrl(input.locale === "ru" ? "/blog" : "/en/blog");
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

// Single source of truth: the visible <Breadcrumbs> component and the
// JSON-LD builder share the same item shape. Field name is `href` to
// match the visible-component prop and how every call-site already
// constructs its trail. The trailing item (current page) typically has
// no `href` — Schema.org allows the last ListItem to omit `item`.
export interface BreadcrumbItem {
  readonly name: string;
  readonly href?: string;
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
    if (item.href) node.item = item.href;
    return node;
  }),
});

export type WebPageType = "WebPage" | "CollectionPage" | "ItemPage" | "AboutPage" | "ProfilePage";

/** One row of a page's visible list of posts: where it links and what it shows. */
export interface PostListEntry {
  readonly url: string;
  readonly headline: string;
}

export interface PostItemListInput {
  readonly locale: Locale;
  readonly canonical: string;
  /** Human name of the list — the archive/section title the page shows. */
  readonly name: string;
  /** Exactly the posts the page links to, in the order it shows them. */
  readonly items: ReadonlyArray<PostListEntry>;
  /** Every current caller lists newest first; pass this only to say otherwise. */
  readonly order?: "Ascending" | "Descending" | "Unordered";
}

export const itemListId = (canonical: string): string => `${canonical}#itemlist`;

/**
 * The single builder for "this page enumerates these posts": the blog index,
 * the home page and the tag archives all emit their list through it, in both
 * locales, so the site's main list of articles exists in the markup.
 *
 * Each entry embeds a MINIMAL typed BlogPosting under the same `@id` the post
 * page uses for its full node — never a bare `{"@id": …}` reference, which
 * would point at a node that lives on another page and so resolves to nothing
 * inside this graph. Same shape as `hasPart` in `nodes-projects.ts`: the
 * reference resolves here, and a crawler that follows `url` finds the complete
 * description.
 */
export const buildPostItemListNode = (input: PostItemListInput) => ({
  "@type": "ItemList",
  "@id": itemListId(input.canonical),
  name: input.name,
  inLanguage: inLang(input.locale),
  numberOfItems: input.items.length,
  itemListOrder: `https://schema.org/ItemListOrder${input.order ?? "Descending"}`,
  itemListElement: input.items.map((item, idx) => ({
    "@type": "ListItem",
    position: idx + 1,
    url: item.url,
    item: {
      "@type": "BlogPosting",
      "@id": `${item.url}#blogposting`,
      url: item.url,
      headline: item.headline,
    },
  })),
});

export interface WebPageInput {
  readonly locale: Locale;
  readonly canonical: string;
  readonly name: string;
  readonly description: string;
  readonly type?: WebPageType;
  readonly primaryImageOfPage?: string;
  readonly dateModified?: Date | null;
  readonly breadcrumbId?: string;
  /** `@id` of the node this page is primarily about (e.g. `#person` on /about). */
  readonly aboutId?: string;
  /** `@id` of the node this page is a container for (BlogPosting, Course, …). */
  readonly mainEntityId?: string;
}

// `about: #person` used to be stamped on every WebPage, which told crawlers
// that the blog index, tag archives and lessons were all "about" the author.
// Only pages that really are (About/Profile) should pass `aboutId`.
export const buildWebPageNode = (input: WebPageInput) => ({
  "@type": input.type ?? "WebPage",
  "@id": `${input.canonical}#webpage`,
  url: input.canonical,
  name: input.name,
  description: input.description,
  inLanguage: inLang(input.locale),
  isPartOf: { "@id": websiteId(input.locale) },
  ...(input.aboutId ? { about: { "@id": input.aboutId } } : {}),
  ...(input.mainEntityId ? { mainEntity: { "@id": input.mainEntityId } } : {}),
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
  /** `@id` of the article the FAQ belongs to; links the FAQ back to the post. */
  readonly aboutId?: string;
}

export const buildFaqPageNode = (input: FaqPageInput) => {
  if (input.items.length === 0) return null;
  return {
    "@type": "FAQPage",
    "@id": `${input.canonical}#faq`,
    isPartOf: { "@id": `${input.canonical}#webpage` },
    ...(input.aboutId ? { about: { "@id": input.aboutId } } : {}),
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

export type CourseLevel = "beginner" | "intermediate" | "advanced";

export interface CourseNodeInput {
  readonly locale: Locale;
  readonly canonical: string;
  readonly name: string;
  readonly description: string;
  readonly level: CourseLevel;
  /** Human workload string from frontmatter, e.g. "~6 часов". Optional. */
  readonly workload?: string;
  /** Lessons in course order: canonical URL of the lesson page and its title. */
  readonly lessons: ReadonlyArray<CourseLessonEntry>;
  readonly image?: string;
  readonly datePublished?: Date;
  readonly dateModified?: Date | null;
}

/** One lesson as the course page lists it. */
export interface CourseLessonEntry {
  readonly url: string;
  readonly name: string;
}

export const courseId = (canonical: string): string => `${canonical}#course`;
export const lessonId = (canonical: string): string => `${canonical}#lesson`;

const educationalLevel = (level: CourseLevel): string =>
  level === "beginner" ? "Beginner" : level === "advanced" ? "Advanced" : "Intermediate";

export const buildCourseNode = (input: CourseNodeInput) => {
  const courseWorkload = parseWorkloadToIsoDuration(input.workload);
  return {
    "@type": "Course",
    "@id": courseId(input.canonical),
    url: input.canonical,
    name: input.name,
    description: input.description,
    inLanguage: inLang(input.locale),
    isAccessibleForFree: true,
    educationalLevel: educationalLevel(input.level),
    numberOfLessons: input.lessons.length,
    provider: { "@id": graphIds.organization },
    author: { "@id": graphIds.person },
    publisher: { "@id": graphIds.organization },
    hasCourseInstance: [
      {
        "@type": "CourseInstance",
        courseMode: "online",
        ...(courseWorkload ? { courseWorkload } : {}),
      },
    ],
    // hasPart used to be bare `{"@id": "…#lesson"}` references to nodes that
    // exist only on the lesson pages, so on the course page every part of the
    // course resolved to nothing. Each entry now carries a minimal node under
    // the SAME `@id` the lesson page uses for the full LearningResource, the
    // way hasPart does for the portfolio in nodes-projects.ts.
    hasPart: input.lessons.map((lesson, index) => ({
      "@type": "LearningResource",
      "@id": lessonId(lesson.url),
      url: lesson.url,
      name: lesson.name,
      position: index + 1,
    })),
    ...(input.image ? { image: input.image } : {}),
    ...(input.datePublished ? { datePublished: input.datePublished.toISOString() } : {}),
    ...(input.dateModified ? { dateModified: input.dateModified.toISOString() } : {}),
  };
};

export interface LearningResourceNodeInput {
  readonly locale: Locale;
  readonly canonical: string;
  readonly courseCanonical: string;
  /** Title of the course the lesson belongs to, for the embedded Course node. */
  readonly courseName: string;
  readonly name: string;
  readonly description: string;
  /** 1-based position inside the course. */
  readonly position: number;
  /** Lesson duration in minutes (frontmatter `duration`). Optional. */
  readonly durationMinutes?: number;
  readonly datePublished?: Date;
  readonly dateModified?: Date;
  /** What the lesson teaches — course tags or a short topic list. */
  readonly teaches?: ReadonlyArray<string>;
}

export const buildLearningResourceNode = (input: LearningResourceNodeInput) => {
  const timeRequired =
    input.durationMinutes === undefined ? null : minutesToIsoDuration(input.durationMinutes);
  return {
    "@type": "LearningResource",
    "@id": lessonId(input.canonical),
    url: input.canonical,
    name: input.name,
    description: input.description,
    learningResourceType: "lesson",
    position: input.position,
    inLanguage: inLang(input.locale),
    isAccessibleForFree: true,
    // The full Course node lives on the course page, not here. A bare
    // reference to it resolved to nothing on all 28 lesson pages, so the
    // lesson names its course with a minimal node under the same `@id`.
    isPartOf: {
      "@type": "Course",
      "@id": courseId(input.courseCanonical),
      url: input.courseCanonical,
      name: input.courseName,
    },
    author: { "@id": graphIds.person },
    publisher: { "@id": graphIds.organization },
    ...(timeRequired ? { timeRequired } : {}),
    ...(input.datePublished ? { datePublished: input.datePublished.toISOString() } : {}),
    ...(input.dateModified ? { dateModified: input.dateModified.toISOString() } : {}),
    ...(input.teaches && input.teaches.length > 0 ? { teaches: input.teaches.join(", ") } : {}),
  };
};
