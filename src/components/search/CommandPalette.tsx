import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { loadPagefind } from "~/lib/search/pagefind-client";
import "./CommandPalette.css";

interface Hit {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly excerpt: string;
}

export default function CommandPalette(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<readonly Hit[]>([]);
  const [loading, setLoading] = useState(false);

  // ⌘K / Ctrl+K toggle, Escape closes, plus a custom event hook so non-React
  // triggers (e.g. the header button) can open the palette without coupling.
  useEffect(() => {
    function openHandler(): void {
      setOpen(true);
    }
    function onKey(e: KeyboardEvent): void {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("astro-open-search", openHandler);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("astro-open-search", openHandler);
    };
  }, []);

  // Debounced Pagefind search.
  useEffect(() => {
    if (query.trim().length === 0) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const pagefind = await loadPagefind();
        const { results } = await pagefind.search(query);
        const limited = results.slice(0, 8);
        const enriched: Hit[] = await Promise.all(
          limited.map(async (r) => {
            const data = await r.data();
            return {
              id: r.id,
              title: data.meta.title ?? data.url,
              url: data.url,
              excerpt: data.excerpt,
            };
          }),
        );
        if (!cancelled) setHits(enriched);
      } catch (err) {
        if (!cancelled) setHits([]);

        console.error("pagefind search failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query]);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Поиск по сайту"
      className="command-palette"
    >
      <Command.Input value={query} onValueChange={setQuery} placeholder="Найти статью…" autoFocus />
      <Command.List>
        {loading && <Command.Loading>Идёт поиск…</Command.Loading>}
        {!loading && query && hits.length === 0 && (
          <Command.Empty>Ничего не найдено.</Command.Empty>
        )}
        {hits.map((h) => (
          <Command.Item
            key={h.id}
            value={`${h.title} ${h.excerpt}`}
            onSelect={() => {
              window.location.href = h.url;
            }}
          >
            <span
              className="command-palette__title"
              // Pagefind returns HTML-escaped + <mark>-highlighted strings
              // built from our own indexed content, not user input.
              dangerouslySetInnerHTML={{ __html: h.title }}
            />
            <span
              className="command-palette__excerpt"
              dangerouslySetInnerHTML={{ __html: h.excerpt }}
            />
          </Command.Item>
        ))}
      </Command.List>
      <div className="command-palette__hint">
        <kbd>↑</kbd>
        <kbd>↓</kbd> навигация · <kbd>Enter</kbd> открыть · <kbd>Esc</kbd> закрыть
      </div>
    </Command.Dialog>
  );
}
