/**
 * SERP title rules shared by BaseLayout, LessonLayout and the title-budget tests.
 *
 * Google renders the SERP title in a fixed box of roughly 600 px and cuts off
 * whatever does not fit. At the size search results use, 600 px works out to
 * about 60 characters for both Cyrillic and Latin copy, so that is the budget
 * a title has to stay inside.
 */
export const TITLE_BUDGET = 60;

export const SITE_BRAND = "artka.dev";

/**
 * Brand suffix — a <title> ends with " | artka.dev" unless it already contains
 * the brand or the suffix would push the title past the budget. When the suffix
 * does not fit it is the part we drop: the domain already appears on its own
 * line in the result, while the words it would push out carry the meaning.
 */
export const brandedTitle = (title: string): string => {
  const withBrand = `${title} | ${SITE_BRAND}`;
  return title.includes(SITE_BRAND) || withBrand.length > TITLE_BUDGET ? title : withBrand;
};

/**
 * A lesson's own title, followed by the course name while both fit the budget.
 * On long lessons the course name goes: the breadcrumbs and the sidebar carry
 * it, and a name that is cut off in the results helps nobody.
 */
export const lessonTitle = (lesson: string, course: string): string => {
  const withCourse = `${lesson} — ${course}`;
  return withCourse.length > TITLE_BUDGET ? lesson : withCourse;
};
