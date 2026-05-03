/**
 * Course progress — localStorage-backed.
 *
 * State shape:
 *   { [courseSlug]: {
 *       completed: string[]            // lesson slugs in completion order
 *       bookmarks: string[]            // lesson slugs the user pinned
 *       lastVisited: string            // most recent lesson slug
 *       updatedAt: number              // unix ms
 *     }
 *   }
 *
 * No server, no auth. If the user clears storage they lose progress —
 * acceptable trade-off for a v1 course UI.
 *
 * The store dispatches a `course-progress:change` CustomEvent on every
 * write so multiple components on the same page stay in sync.
 */

const KEY = "artka-course-progress-v1";

export interface CourseState {
  completed: string[];
  bookmarks: string[];
  lastVisited?: string;
  updatedAt: number;
}

export interface ProgressMap {
  [courseSlug: string]: CourseState;
}

export const emptyState = (): CourseState => ({
  completed: [],
  bookmarks: [],
  updatedAt: Date.now(),
});

const isBrowser = (): boolean => typeof window !== "undefined";

export const readAll = (): ProgressMap => {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ProgressMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeAll = (map: ProgressMap): void => {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent("course-progress:change", { detail: map }));
  } catch {
    /* localStorage may be disabled (Safari private). Silently no-op. */
  }
};

export const getCourse = (courseSlug: string): CourseState => {
  const all = readAll();
  return all[courseSlug] ?? emptyState();
};

const update = (courseSlug: string, mutate: (c: CourseState) => CourseState): CourseState => {
  const all = readAll();
  const next = mutate(all[courseSlug] ?? emptyState());
  next.updatedAt = Date.now();
  all[courseSlug] = next;
  writeAll(all);
  return next;
};

export const markComplete = (courseSlug: string, lessonSlug: string): CourseState =>
  update(courseSlug, (c) => {
    if (c.completed.includes(lessonSlug)) return c;
    return { ...c, completed: [...c.completed, lessonSlug] };
  });

export const unmarkComplete = (courseSlug: string, lessonSlug: string): CourseState =>
  update(courseSlug, (c) => ({ ...c, completed: c.completed.filter((s) => s !== lessonSlug) }));

export const toggleBookmark = (courseSlug: string, lessonSlug: string): CourseState =>
  update(courseSlug, (c) => {
    const has = c.bookmarks.includes(lessonSlug);
    return {
      ...c,
      bookmarks: has ? c.bookmarks.filter((s) => s !== lessonSlug) : [...c.bookmarks, lessonSlug],
    };
  });

export const setLastVisited = (courseSlug: string, lessonSlug: string): CourseState =>
  update(courseSlug, (c) => ({ ...c, lastVisited: lessonSlug }));

export interface ProgressSummary {
  total: number;
  completed: number;
  percent: number; // 0–100
}

export const summarise = (state: CourseState, totalLessons: number): ProgressSummary => {
  const completed = state.completed.length;
  return {
    total: totalLessons,
    completed,
    percent: totalLessons === 0 ? 0 : Math.round((completed / totalLessons) * 100),
  };
};
