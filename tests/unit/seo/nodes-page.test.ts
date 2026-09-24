import { describe, expect, it } from "vitest";
import {
  buildBlogPostingNode,
  buildBreadcrumbListNode,
  buildWebPageNode,
  buildFaqPageNode,
  buildCourseNode,
  buildLearningResourceNode,
  buildPostItemListNode,
  courseId,
  itemListId,
  lessonId,
  minutesToIsoDuration,
  parseWorkloadToIsoDuration,
} from "~/lib/seo/nodes-page";
import { graphIds } from "~/lib/seo/nodes-global";

describe("buildBlogPostingNode", () => {
  const baseInput = {
    locale: "ru" as const,
    canonical: "https://artka.dev/blog/foo",
    title: "Заголовок поста",
    description: "Описание",
    pubDate: new Date("2026-04-23T00:00:00.000Z"),
    updatedDate: new Date("2026-04-26T00:00:00.000Z"),
    image: "https://artka.dev/uploads/foo.png",
    keywords: ["claude-code", "guide"],
    articleBody: "Lorem ipsum dolor",
    wordCount: 1234,
  };

  it("references author and publisher by @id only", () => {
    const node = buildBlogPostingNode(baseInput);
    expect(node.author).toEqual({ "@id": graphIds.person });
    expect(node.publisher).toEqual({ "@id": graphIds.organization });
  });

  it("emits @id derived from canonical", () => {
    const node = buildBlogPostingNode(baseInput);
    expect(node["@id"]).toBe("https://artka.dev/blog/foo#blogposting");
  });

  it("includes articleBody and wordCount", () => {
    const node = buildBlogPostingNode(baseInput);
    expect(node.articleBody).toBe("Lorem ipsum dolor");
    expect(node.wordCount).toBe(1234);
  });

  it("omits keywords when empty", () => {
    const node = buildBlogPostingNode({ ...baseInput, keywords: [] });
    expect("keywords" in node).toBe(false);
  });

  it("links mainEntityOfPage to the page's WebPage node and marks it free", () => {
    const node = buildBlogPostingNode(baseInput);
    expect(node.mainEntityOfPage).toEqual({ "@id": "https://artka.dev/blog/foo#webpage" });
    expect(node.url).toBe("https://artka.dev/blog/foo");
    expect(node.isAccessibleForFree).toBe(true);
    expect(node).not.toHaveProperty("articleSection");
    expect(node).not.toHaveProperty("timeRequired");
  });

  it("emits articleSection and ISO 8601 timeRequired when provided", () => {
    const node = buildBlogPostingNode({
      ...baseInput,
      articleSection: "claude-code",
      readingMinutes: 7,
    });
    expect(node.articleSection).toBe("claude-code");
    expect(node.timeRequired).toBe("PT7M");
  });

  it("omits dateModified when same as pubDate", () => {
    const same = baseInput.pubDate;
    const node = buildBlogPostingNode({ ...baseInput, updatedDate: same });
    expect(node.dateModified).toBe(same.toISOString());
  });
});

describe("buildBreadcrumbListNode", () => {
  it("renders 3-level RU breadcrumb", () => {
    const node = buildBreadcrumbListNode({
      locale: "ru",
      blogIndexLabel: "Блог",
      title: "Заголовок",
    });
    expect(node["@type"]).toBe("BreadcrumbList");
    expect(node.itemListElement).toHaveLength(3);
    expect(node.itemListElement[0]?.name).toBe("Главная");
    expect(node.itemListElement[1]?.item).toBe("https://artka.dev/blog/");
    expect(node.itemListElement[2]?.name).toBe("Заголовок");
  });

  it("uses /en/ paths for en locale", () => {
    const node = buildBreadcrumbListNode({
      locale: "en",
      blogIndexLabel: "Blog",
      title: "Title",
    });
    expect(node.itemListElement[0]?.item).toBe("https://artka.dev/en/");
    expect(node.itemListElement[1]?.item).toBe("https://artka.dev/en/blog/");
  });
});

describe("buildWebPageNode", () => {
  // `about: #person` used to be hardcoded on every WebPage; now it is opt-in
  // via aboutId so only /about claims to be about the author.
  it("emits WebPage without `about` unless aboutId is given", () => {
    const node = buildWebPageNode({
      locale: "ru",
      canonical: "https://artka.dev/blog/",
      name: "Блог",
      description: "О",
    });
    expect(node["@type"]).toBe("WebPage");
    expect(node["@id"]).toBe("https://artka.dev/blog/#webpage");
    expect(node).not.toHaveProperty("about");
    expect(node).not.toHaveProperty("mainEntity");
    expect(node.isPartOf).toEqual({ "@id": graphIds.websiteRu });
    expect(node.inLanguage).toBe("ru-RU");
  });

  it("links about/mainEntity by @id and the EN website for en pages", () => {
    const node = buildWebPageNode({
      locale: "en",
      canonical: "https://artka.dev/en/about/",
      name: "About",
      description: "A",
      type: "ProfilePage",
      aboutId: graphIds.person,
      mainEntityId: graphIds.person,
    });
    expect(node["@type"]).toBe("ProfilePage");
    expect(node.about).toEqual({ "@id": graphIds.person });
    expect(node.mainEntity).toEqual({ "@id": graphIds.person });
    expect(node.isPartOf).toEqual({ "@id": graphIds.websiteEn });
  });
});

describe("buildPostItemListNode", () => {
  const canonical = "https://artka.dev/blog/";
  const items = [
    { url: "https://artka.dev/blog/alpha/", headline: "Альфа" },
    { url: "https://artka.dev/blog/beta/", headline: "Бета" },
  ];

  it("addresses the list by canonical and counts what it was given", () => {
    const node = buildPostItemListNode({ locale: "ru", canonical, name: "Блог", items });
    expect(node["@type"]).toBe("ItemList");
    expect(node["@id"]).toBe(itemListId(canonical));
    expect(itemListId(canonical)).toBe("https://artka.dev/blog/#itemlist");
    expect(node.name).toBe("Блог");
    expect(node.inLanguage).toBe("ru-RU");
    expect(node.numberOfItems).toBe(items.length);
    expect(node.itemListOrder).toBe("https://schema.org/ItemListOrderDescending");
  });

  it("keeps the given order and numbers positions 1..n", () => {
    const node = buildPostItemListNode({ locale: "en", canonical, name: "Blog", items });
    expect(node.itemListElement.map((el) => el.position)).toEqual([1, 2]);
    expect(node.itemListElement.map((el) => el.url)).toEqual(items.map((i) => i.url));

    const reversed = buildPostItemListNode({
      locale: "en",
      canonical,
      name: "Blog",
      items: [...items].reverse(),
    });
    expect(reversed.itemListElement.map((el) => el.url)).toEqual(
      [...items].reverse().map((i) => i.url),
    );
  });

  // The rule the whole builder exists for: a post lives on its own page, so a
  // bare {"@id": …} here would resolve to nothing in this page's @graph.
  it("embeds a minimal typed BlogPosting instead of a bare @id reference", () => {
    const node = buildPostItemListNode({ locale: "ru", canonical, name: "Блог", items });
    for (const [idx, element] of node.itemListElement.entries()) {
      const item = element.item as Record<string, unknown>;
      expect(Object.keys(item)).not.toEqual(["@id"]);
      expect(item["@type"]).toBe("BlogPosting");
      expect(item["@id"]).toBe(`${items[idx]!.url}#blogposting`);
      expect(item.url).toBe(items[idx]!.url);
      expect(item.headline).toBe(items[idx]!.headline);
    }
  });

  it("survives an empty list without inventing entries", () => {
    const node = buildPostItemListNode({ locale: "en", canonical, name: "Blog", items: [] });
    expect(node.numberOfItems).toBe(0);
    expect(node.itemListElement).toEqual([]);
  });

  it("honours an explicit order", () => {
    const node = buildPostItemListNode({
      locale: "en",
      canonical,
      name: "Blog",
      items,
      order: "Ascending",
    });
    expect(node.itemListOrder).toBe("https://schema.org/ItemListOrderAscending");
  });
});

describe("buildCourseNode / buildLearningResourceNode", () => {
  const courseCanonical = "https://artka.dev/courses/claude-code-guide/";
  const lessonUrls = [
    "https://artka.dev/courses/claude-code-guide/01-introduction/",
    "https://artka.dev/courses/claude-code-guide/02-context-and-cache/",
  ];
  const lessons = lessonUrls.map((url, index) => ({ url, name: `Lesson ${index + 1}` }));
  const courseName = "Claude Code Guide";

  it("emits a free online Course with workload, level and its lessons as defined parts", () => {
    const node = buildCourseNode({
      locale: "ru",
      canonical: courseCanonical,
      name: "Claude Code Guide",
      description: "Курс",
      level: "intermediate",
      workload: "~6 часов",
      lessons,
      datePublished: new Date("2026-04-23T00:00:00.000Z"),
      dateModified: new Date("2026-08-24T00:00:00.000Z"),
    });
    expect(node["@type"]).toBe("Course");
    expect(node["@id"]).toBe(courseId(courseCanonical));
    expect(node.url).toBe(courseCanonical);
    expect(node.provider).toEqual({ "@id": graphIds.organization });
    expect(node.author).toEqual({ "@id": graphIds.person });
    expect(node.inLanguage).toBe("ru-RU");
    expect(node.isAccessibleForFree).toBe(true);
    expect(node.educationalLevel).toBe("Intermediate");
    expect(node.numberOfLessons).toBe(2);
    expect(node.hasCourseInstance).toEqual([
      { "@type": "CourseInstance", courseMode: "online", courseWorkload: "PT6H" },
    ]);
    // Each part DEFINES the lesson under the id the lesson page uses: a bare
    // {"@id"} would point at a node this page does not publish.
    expect(node.hasPart).toEqual(
      lessons.map((lesson, index) => ({
        "@type": "LearningResource",
        "@id": lessonId(lesson.url),
        url: lesson.url,
        name: lesson.name,
        position: index + 1,
      })),
    );
    expect(node.numberOfLessons).toBe(node.hasPart.length);
    expect(node.dateModified).toBe("2026-08-24T00:00:00.000Z");
  });

  it("omits courseWorkload when the human duration is not parseable", () => {
    const node = buildCourseNode({
      locale: "en",
      canonical: courseCanonical,
      name: "C",
      description: "D",
      level: "beginner",
      workload: "self-paced",
      lessons: [],
    });
    expect(node.hasCourseInstance[0]).toEqual({ "@type": "CourseInstance", courseMode: "online" });
    expect(node.educationalLevel).toBe("Beginner");
  });

  it("emits a LearningResource lesson that names its course as a defined node", () => {
    const node = buildLearningResourceNode({
      locale: "en",
      canonical: lessonUrls[1]!,
      courseCanonical,
      courseName,
      name: "02. Context",
      description: "Lesson",
      position: 2,
      durationMinutes: 25,
      datePublished: new Date("2026-04-23T00:00:00.000Z"),
      dateModified: new Date("2026-09-08T00:00:00.000Z"),
      teaches: ["claude-code", "guide"],
    });
    expect(node["@type"]).toBe("LearningResource");
    expect(node["@id"]).toBe(`${lessonUrls[1]}#lesson`);
    expect(node.learningResourceType).toBe("lesson");
    expect(node.datePublished).toBe("2026-04-23T00:00:00.000Z");
    expect(node.dateModified).toBe("2026-09-08T00:00:00.000Z");
    expect(node.position).toBe(2);
    expect(node.timeRequired).toBe("PT25M");
    // Same id as the full Course node on the course page, but defined here too:
    // the lesson page does not publish that node, so a bare reference dangles.
    expect(node.isPartOf).toEqual({
      "@type": "Course",
      "@id": courseId(courseCanonical),
      url: courseCanonical,
      name: courseName,
    });
    expect(node.inLanguage).toBe("en-US");
    expect(node.isAccessibleForFree).toBe(true);
    expect(node.teaches).toBe("claude-code, guide");
  });

  it("omits timeRequired when the lesson has no duration", () => {
    const node = buildLearningResourceNode({
      locale: "ru",
      canonical: lessonUrls[0]!,
      courseCanonical,
      courseName,
      name: "01",
      description: "L",
      position: 1,
    });
    expect(node).not.toHaveProperty("timeRequired");
    expect(node).not.toHaveProperty("dateModified");
    expect(node).not.toHaveProperty("teaches");
  });
});

describe("duration helpers", () => {
  it("formats minutes as ISO 8601", () => {
    expect(minutesToIsoDuration(1)).toBe("PT1M");
    expect(minutesToIsoDuration(60)).toBe("PT1H");
    expect(minutesToIsoDuration(90)).toBe("PT1H30M");
    expect(minutesToIsoDuration(0)).toBeNull();
  });

  it("parses RU and EN human workloads", () => {
    expect(parseWorkloadToIsoDuration("~6 часов")).toBe("PT6H");
    expect(parseWorkloadToIsoDuration("~6 hours")).toBe("PT6H");
    expect(parseWorkloadToIsoDuration("1.5h")).toBe("PT1H30M");
    expect(parseWorkloadToIsoDuration("45 мин")).toBe("PT45M");
    expect(parseWorkloadToIsoDuration("self-paced")).toBeNull();
    expect(parseWorkloadToIsoDuration(undefined)).toBeNull();
  });
});

describe("buildFaqPageNode", () => {
  it("returns null when no faq items", () => {
    expect(buildFaqPageNode({ canonical: "https://artka.dev/blog/foo", items: [] })).toBeNull();
  });

  it("links the FAQ to its article via about when aboutId is given", () => {
    const node = buildFaqPageNode({
      canonical: "https://artka.dev/blog/foo",
      items: [{ question: "Q1?", answer: "A1." }],
      aboutId: "https://artka.dev/blog/foo#blogposting",
    });
    expect(node!.about).toEqual({ "@id": "https://artka.dev/blog/foo#blogposting" });
  });

  it("renders Question/Answer pairs when items present", () => {
    const node = buildFaqPageNode({
      canonical: "https://artka.dev/blog/foo",
      items: [{ question: "Q1?", answer: "A1." }],
    });
    expect(node).not.toBeNull();
    expect(node!["@type"]).toBe("FAQPage");
    expect(node!.isPartOf).toEqual({ "@id": "https://artka.dev/blog/foo#webpage" });
    expect(node!.mainEntity).toHaveLength(1);
    expect(node!.mainEntity[0]?.["@type"]).toBe("Question");
    expect(node!.mainEntity[0]?.acceptedAnswer["@type"]).toBe("Answer");
    expect(node!.mainEntity[0]?.acceptedAnswer.text).toBe("A1.");
  });
});
