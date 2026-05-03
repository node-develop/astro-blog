/**
 * SideNotes — reposition footnote items into the right rail at >= 1280px.
 *
 * Should be loaded once on every post page (PostLayout).
 *
 *   <script>import("~/lib/posts/side-notes").then(m => m.initSideNotes());</script>
 *
 * Algorithm:
 *   - For each <a data-footnote-ref> in the article, find its bounding
 *     rect's top relative to the post container.
 *   - Look up <li id="user-content-fn-N"> in section[data-footnotes].
 *   - Set its `top` to align with the ref. Stack collisions by pushing
 *     subsequent notes down by their natural height + 16px.
 */

const MIN_VIEWPORT = 1280;

interface ScheduleHandle {
  cancel: () => void;
}

const schedule = (fn: () => void): ScheduleHandle => {
  let frame = requestAnimationFrame(fn);
  return { cancel: () => cancelAnimationFrame(frame) };
};

export const initSideNotes = (): void => {
  const article = document.querySelector<HTMLElement>(".post");
  const section = document.querySelector<HTMLElement>(".prose section[data-footnotes]");
  if (!article || !section) return;
  if (article.dataset.sideNotesBound === "1") return;
  article.dataset.sideNotesBound = "1";

  const layout = (): void => {
    const wide = window.innerWidth >= MIN_VIEWPORT;
    if (!wide) {
      section.querySelectorAll<HTMLLIElement>("li").forEach((li) => {
        li.style.position = "";
        li.style.top = "";
      });
      return;
    }

    const refs = Array.from(article.querySelectorAll<HTMLAnchorElement>("a[data-footnote-ref]"));
    const articleTop = article.getBoundingClientRect().top + window.scrollY;
    let lastBottom = 0;

    refs.forEach((ref) => {
      const id = ref.getAttribute("href")?.replace(/^#/, "");
      if (!id) return;
      const li = section.querySelector<HTMLLIElement>(`li[id="${CSS.escape(id)}"]`);
      if (!li) return;

      const refTop = ref.getBoundingClientRect().top + window.scrollY - articleTop;
      const top = Math.max(refTop, lastBottom + 16);
      li.style.position = "absolute";
      li.style.top = `${top}px`;

      const liHeight = li.getBoundingClientRect().height || 60;
      lastBottom = top + liHeight;
    });
  };

  let pending: ScheduleHandle | null = null;
  const onResize = (): void => {
    if (pending) return;
    pending = schedule(() => {
      pending = null;
      layout();
    });
  };

  layout();
  window.addEventListener("resize", onResize, { passive: true });
  // Re-layout once webfonts settle (heading offsets may shift).
  if (document.fonts && typeof document.fonts.ready?.then === "function") {
    document.fonts.ready.then(() => layout());
  }
};
