/**
 * Phase 5 — auto-completion script for the lesson layout.
 *
 * Marks a lesson "complete" when BOTH conditions hold:
 *   1. User has scrolled past the last <h2> within the lesson body
 *      (or the article's last paragraph if there are no headings).
 *   2. The user has spent at least DWELL_MS active milliseconds on the
 *      page. "Active" = page is visible AND tab is focused.
 *
 * Both criteria together prevent two failure modes:
 *   - Fast scroll-to-bottom without reading.
 *   - Tab opened in background and forgotten.
 *
 * Manual completion via the existing "Mark complete" button bypasses
 * this entirely and stays first-class.
 *
 * The script reads required slugs from data attrs on the <article>:
 *   <article data-course-slug={course} data-lesson-slug={lesson}>…</article>
 */
import { getCourse, markCompleteAsync } from "./progress";

const DWELL_MS = 30_000;
const SCROLL_THRESHOLD_PX = 64;

let dwellAccumulator = 0;
let dwellLastTick = 0;
let dwellRaf = 0;
let scrolledToEnd = false;
let observer: IntersectionObserver | null = null;
let cleanup: Array<() => void> = [];

const isPageActive = (): boolean => document.visibilityState === "visible" && document.hasFocus();

const tickDwell = (): void => {
  const now = performance.now();
  if (dwellLastTick > 0 && isPageActive()) {
    dwellAccumulator += now - dwellLastTick;
  }
  dwellLastTick = now;
  if (dwellAccumulator < DWELL_MS) {
    dwellRaf = requestAnimationFrame(tickDwell);
  }
};

const startDwellTimer = (): void => {
  dwellLastTick = performance.now();
  dwellRaf = requestAnimationFrame(tickDwell);
};

const stopDwellTimer = (): void => {
  if (dwellRaf) cancelAnimationFrame(dwellRaf);
  dwellRaf = 0;
};

const tryComplete = async (courseSlug: string, lessonSlug: string): Promise<void> => {
  if (!scrolledToEnd) return;
  if (dwellAccumulator < DWELL_MS) return;
  const already = getCourse(courseSlug);
  if (already.completed.includes(lessonSlug)) return;
  await markCompleteAsync(courseSlug, lessonSlug, { source: "auto" });
  observer?.disconnect();
  stopDwellTimer();
  cleanup.forEach((fn) => fn());
  cleanup = [];
};

export const initLessonAutoComplete = (): void => {
  dwellAccumulator = 0;
  scrolledToEnd = false;
  observer?.disconnect();
  stopDwellTimer();
  cleanup.forEach((fn) => fn());
  cleanup = [];

  const article = document.querySelector<HTMLElement>("[data-course-slug][data-lesson-slug]");
  if (!article) return;

  const courseSlug = article.dataset.courseSlug ?? "";
  const lessonSlug = article.dataset.lessonSlug ?? "";
  if (!courseSlug || !lessonSlug) return;

  const lastHeading = article.querySelector<HTMLElement>("h2:last-of-type, h3:last-of-type");
  const sentinel = lastHeading ?? article;

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (
          entry.isIntersecting ||
          entry.boundingClientRect.bottom < window.innerHeight + SCROLL_THRESHOLD_PX
        ) {
          scrolledToEnd = true;
          void tryComplete(courseSlug, lessonSlug);
        }
      }
    },
    { rootMargin: `0px 0px -${SCROLL_THRESHOLD_PX}px 0px`, threshold: 0 },
  );
  observer.observe(sentinel);

  startDwellTimer();

  const onChange = (): void => {
    void tryComplete(courseSlug, lessonSlug);
  };
  document.addEventListener("visibilitychange", onChange);
  window.addEventListener("focus", onChange);
  cleanup.push(() => document.removeEventListener("visibilitychange", onChange));
  cleanup.push(() => window.removeEventListener("focus", onChange));

  const interval = window.setInterval(() => {
    void tryComplete(courseSlug, lessonSlug);
  }, 5_000);
  cleanup.push(() => window.clearInterval(interval));
};
