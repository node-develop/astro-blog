const SVG_COPY = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
</svg>`;

const SVG_CHECK = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <polyline points="20 6 9 17 4 12"></polyline>
</svg>`;

const LANGS_WITHOUT_HEADER = new Set(["plaintext", "text", "plain", ""]);

const createCopyButton = (): { button: HTMLButtonElement; liveRegion: HTMLSpanElement } => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "code-block__copy";
  button.setAttribute("aria-label", "Copy code");
  button.innerHTML = SVG_COPY;

  // aria-live region is a sibling of the button (outside it) so that
  // setting button.innerHTML = SVG_* never destroys the live region.
  const liveRegion = document.createElement("span");
  liveRegion.className = "sr-only";
  liveRegion.setAttribute("aria-live", "polite");

  return { button, liveRegion };
};

const attachCopyHandler = (
  button: HTMLButtonElement,
  liveRegion: HTMLSpanElement,
  pre: HTMLPreElement,
): void => {
  let resetTimer: ReturnType<typeof setTimeout> | null = null;

  const reset = () => {
    button.innerHTML = SVG_COPY;
    delete button.dataset.state;
    liveRegion.textContent = "";
    resetTimer = null;
  };

  button.addEventListener("click", () => {
    const text = pre.innerText;

    navigator.clipboard
      .writeText(text)
      .then(() => {
        button.innerHTML = SVG_CHECK;
        button.dataset.state = "copied";
        liveRegion.textContent = "Copied";

        if (resetTimer !== null) clearTimeout(resetTimer);
        resetTimer = setTimeout(reset, 1600);
      })
      .catch(() => {
        liveRegion.textContent = "Failed to copy";

        if (resetTimer !== null) clearTimeout(resetTimer);
        resetTimer = setTimeout(() => {
          liveRegion.textContent = "";
          resetTimer = null;
        }, 1600);
      });
  });
};

export const enhanceCodeBlocks = (root: HTMLElement | Document = document): void => {
  const body =
    root instanceof Document
      ? root.querySelector<HTMLElement>(".post__body")
      : (root.querySelector<HTMLElement>(".post__body") ?? (root as HTMLElement));

  if (!body) return;

  const pres = body.querySelectorAll<HTMLPreElement>("pre.astro-code");

  pres.forEach((pre) => {
    if (pre.dataset.enhanced === "true") return;

    const rawLang = (pre.dataset.language ?? "").toLowerCase().trim();
    const hasHeader = rawLang !== "" && !LANGS_WITHOUT_HEADER.has(rawLang);

    const figure = document.createElement("figure");
    figure.className = "code-block";

    const { button, liveRegion } = createCopyButton();
    attachCopyHandler(button, liveRegion, pre);

    pre.parentNode?.insertBefore(figure, pre);

    if (hasHeader) {
      const header = document.createElement("header");
      header.className = "code-block__header";

      const langSpan = document.createElement("span");
      langSpan.className = "code-block__lang";
      langSpan.textContent = rawLang.toUpperCase();

      header.appendChild(langSpan);
      header.appendChild(button);
      header.appendChild(liveRegion);
      figure.appendChild(header);
    } else {
      figure.classList.add("code-block--floating");
      figure.appendChild(button);
      figure.appendChild(liveRegion);
    }

    figure.appendChild(pre);
    pre.dataset.enhanced = "true";
  });
};
