/**
 * Typed port of Cal.com's official embed snippet
 * (calcom/cal.com, packages/embeds/embed-snippet/src/index.ts).
 *
 * It installs a queueing `Cal()` on the host, appends embed.js on the first
 * instruction, and keeps one queue per namespace. embed.js drains those
 * queues when it loads and swaps in the real API, so callers must always go
 * through `window.Cal.ns[name]` rather than hold on to a queue function.
 *
 * Kept behaviourally identical to the upstream snippet: embed.js reads `q`,
 * `ns` and `loaded` off the global, and the "initNamespace" handshake is what
 * makes a namespace live.
 */

export type CalInstruction = readonly unknown[];

export type CalQueue = ((...args: unknown[]) => void) & { q: CalInstruction[] };

export type CalGlobal = CalQueue & {
  ns: Record<string, CalQueue>;
  loaded: boolean;
};

/** The slice of `window` the snippet touches; a plain object in tests. */
export type CalHost = {
  Cal?: CalGlobal;
  document: {
    createElement: (tag: "script") => { src: string; async: boolean };
    head: { appendChild: <T>(node: T) => T };
  };
};

const createQueue = (): CalQueue => {
  const q: CalInstruction[] = [];
  return Object.assign((...args: unknown[]) => void q.push(args), { q });
};

export const installCalSnippet = (host: CalHost, embedUrl: string): CalGlobal => {
  if (host.Cal) return host.Cal;

  const cal: CalGlobal = Object.assign(
    (...args: unknown[]) => {
      if (!cal.loaded) {
        const script = host.document.createElement("script");
        script.src = embedUrl;
        script.async = true;
        host.document.head.appendChild(script);
        cal.loaded = true;
      }

      const [instruction, namespace] = args;
      if (instruction === "init" && typeof namespace === "string") {
        // Re-running init must not replace a namespace embed.js already owns.
        const api = cal.ns[namespace] ?? createQueue();
        cal.ns[namespace] = api;
        api.q.push(args);
        cal.q.push(["initNamespace", namespace]);
        return;
      }
      cal.q.push(args);
    },
    { q: [] as CalInstruction[], ns: {} as Record<string, CalQueue>, loaded: false },
  );

  host.Cal = cal;
  return cal;
};
