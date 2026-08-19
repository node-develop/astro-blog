/**
 * Lazy loading for the blog index post grid.
 *
 * A sentinel below the grid carries the next page number and the partial
 * base URL. When it scrolls near the viewport, the next HTML fragment is
 * fetched from the server-rendered partial route and its <li> cards are
 * appended with a staggered fade-up (motion durations come from tokens,
 * which already collapse to 0ms under prefers-reduced-motion; the JS
 * guard additionally skips the stagger delays).
 *
 * Fetch failures are swallowed on purpose: the observer stays armed, so
 * the next scroll intersection simply retries — an error toast would be
 * noise for a progressive-enhancement feature whose fallback is "the
 * rest of the archive is one click away on /tags/".
 */

const ENTER_CLASS = "is-entering";
const STAGGER_MS = 70;

export const initLazyPostList = (doc: Document): void => {
  const sentinel = doc.querySelector<HTMLElement>("[data-blog-sentinel]");
  const grid = doc.querySelector<HTMLElement>("[data-blog-grid]");
  if (!sentinel || !grid || sentinel.dataset.lazyInit === "true") return;
  sentinel.dataset.lazyInit = "true";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let loading = false;

  const finish = (observer: IntersectionObserver): void => {
    observer.disconnect();
    sentinel.remove();
  };

  const loadNext = async (observer: IntersectionObserver): Promise<void> => {
    const page = sentinel.dataset.nextPage;
    const base = sentinel.dataset.partialBase;
    if (loading || !page || !base) return;
    loading = true;
    try {
      const res = await fetch(`${base}${page}/`);
      if (!res.ok) {
        // 404 = the archive genuinely ended (page out of range) — stop.
        // Anything else (5xx, network middlebox) is transient: keep the
        // observer armed so the next scroll intersection retries.
        if (res.status === 404) finish(observer);
        return;
      }
      const tpl = doc.createElement("template");
      tpl.innerHTML = await res.text();
      const items = Array.from(tpl.content.querySelectorAll("li"));
      const next = tpl.content.querySelector<HTMLElement>("[data-next-page]");

      for (const [i, li] of items.entries()) {
        if (!reduceMotion) {
          li.classList.add(ENTER_CLASS);
          li.style.transitionDelay = `${i * STAGGER_MS}ms`;
        }
        grid.append(li);
      }
      if (!reduceMotion) {
        // Двойной rAF: браузер должен успеть отрисовать стартовое состояние
        // (opacity 0), иначе transition не сыграет.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            for (const li of items) li.classList.remove(ENTER_CLASS);
          });
        });
        window.setTimeout(
          () => {
            for (const li of items) li.style.transitionDelay = "";
          },
          items.length * STAGGER_MS + 800,
        );
      }

      // Announce the append to assistive tech via the polite live region.
      const status = doc.querySelector<HTMLElement>("[data-blog-status]");
      const announce = sentinel.dataset.announce;
      if (status && announce && items.length > 0) {
        status.textContent = announce;
      }

      const nextPage = next?.getAttribute("data-next-page");
      if (nextPage) {
        sentinel.dataset.nextPage = nextPage;
      } else {
        finish(observer);
      }
    } catch {
      // Transient network failure — keep the observer armed for a retry.
    } finally {
      loading = false;
    }
  };

  const observer = new IntersectionObserver(
    (entries, self) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadNext(self);
    },
    // 240px: близко к вьюпорту, чтобы подгрузка была видна как событие
    // при скролле, но карточки успевали появиться до конца прокрутки.
    { rootMargin: "240px 0px" },
  );
  observer.observe(sentinel);
};
