/**
 * Course progress — localStorage-backed, with optional Postgres sync
 * for signed-in users.
 *
 * Public surface (kept for Phase 4 callers — LessonLayout, CourseLayout):
 *   getCourse(slug) → CourseState              // { completed, bookmarks, lastVisited, updatedAt }
 *   markComplete(slug, lesson) → CourseState   // sync, localStorage only
 *   unmarkComplete(slug, lesson) → CourseState
 *   toggleBookmark(slug, lesson) → CourseState
 *   setLastVisited(slug, lesson) → CourseState
 *   summarise(state, total) → ProgressSummary
 *
 * Phase 5 additions (server sync via Astro Actions):
 *   markCompleteAsync(slug, lesson, opts?) → Promise<void>
 *   markIncompleteAsync(slug, lesson) → Promise<void>
 *   syncFromServer(slug) → Promise<void>
 *   onProgressChange(handler) → unsubscribe
 *
 * Sign-in is detected via `body[data-auth="signed-in"]` (set by
 * BaseLayout's auth-check script). Anonymous users stay local-only.
 */

const KEY = "artka-course-progress-v1";
const EVENT = "course-progress:change";
const PHASE5_EVENT = "artka:progress-change";

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

const isSignedIn = (): boolean =>
  typeof document !== "undefined" && document.body.dataset.auth === "signed-in";

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

const writeAll = (map: ProgressMap, courseSlug?: string): void => {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: map }));
    if (courseSlug) {
      window.dispatchEvent(new CustomEvent(PHASE5_EVENT, { detail: { courseSlug } }));
    }
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
  writeAll(all, courseSlug);
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
  percent: number;
}

export const summarise = (state: CourseState, totalLessons: number): ProgressSummary => {
  const completed = state.completed.length;
  return {
    total: totalLessons,
    completed,
    percent: totalLessons === 0 ? 0 : Math.round((completed / totalLessons) * 100),
  };
};

/* ──────────────────────────────────────────────────────────────── */
/* Phase 5 — server sync helpers                                    */
/* ──────────────────────────────────────────────────────────────── */

export const markCompleteAsync = async (
  courseSlug: string,
  lessonSlug: string,
  opts: { source?: "auto" | "manual" } = {},
): Promise<void> => {
  markComplete(courseSlug, lessonSlug);
  if (!isSignedIn()) return;
  try {
    const { actions } = await import("astro:actions");
    await actions.courseProgress.markComplete({
      courseSlug,
      lessonSlug,
      source: opts.source ?? "manual",
    });
  } catch {
    /* local cache wins; next pageview will retry sync */
  }
};

export const markIncompleteAsync = async (
  courseSlug: string,
  lessonSlug: string,
): Promise<void> => {
  unmarkComplete(courseSlug, lessonSlug);
  if (!isSignedIn()) return;
  try {
    const { actions } = await import("astro:actions");
    await actions.courseProgress.markIncomplete({ courseSlug, lessonSlug });
  } catch {
    /* swallow */
  }
};

export const syncFromServer = async (courseSlug: string): Promise<void> => {
  if (!isSignedIn()) return;
  try {
    const { actions } = await import("astro:actions");
    const result = await actions.courseProgress.listCourse({ courseSlug });
    if (!result.data) return;
    const remote = new Set(result.data);
    const localState = getCourse(courseSlug);
    const merged = Array.from(new Set<string>([...localState.completed, ...remote]));
    update(courseSlug, (c) => ({ ...c, completed: merged }));
    const localOnly = localState.completed.filter((s) => !remote.has(s));
    for (const lessonSlug of localOnly) {
      await actions.courseProgress.markComplete({
        courseSlug,
        lessonSlug,
        source: "import",
      });
    }
  } catch {
    /* server unavailable — keep local-only state */
  }
};

export const onProgressChange = (handler: (courseSlug: string) => void): (() => void) => {
  if (typeof window === "undefined") return () => undefined;
  const local = (e: Event): void => {
    const detail = (e as CustomEvent<{ courseSlug: string }>).detail;
    if (detail?.courseSlug) handler(detail.courseSlug);
  };
  const cross = (e: StorageEvent): void => {
    if (e.key === KEY) {
      // We don't know which course changed cross-tab; signal "*"
      handler("*");
    }
  };
  window.addEventListener(PHASE5_EVENT, local);
  window.addEventListener("storage", cross);
  return () => {
    window.removeEventListener(PHASE5_EVENT, local);
    window.removeEventListener("storage", cross);
  };
};
