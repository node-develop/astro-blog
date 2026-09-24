import { describe, expect, it } from "vitest";
import { installCalSnippet, type CalHost } from "~/lib/booking/snippet";

const fakeHost = (): { host: CalHost; appended: { src: string; async: boolean }[] } => {
  const appended: { src: string; async: boolean }[] = [];
  const host: CalHost = {
    document: {
      createElement: () => ({ src: "", async: false }),
      head: {
        appendChild: <T>(node: T): T => {
          appended.push(node as { src: string; async: boolean });
          return node;
        },
      },
    },
  };
  return { host, appended };
};

describe("installCalSnippet", () => {
  it("injects embed.js once, on the first instruction, not on install", () => {
    const { host, appended } = fakeHost();
    const cal = installCalSnippet(host, "https://app.cal.com/embed/embed.js");
    expect(appended).toHaveLength(0);

    cal("init", "book-1", { origin: "https://app.cal.com" });
    cal("init", "book-2", { origin: "https://app.cal.com" });

    expect(appended).toEqual([{ src: "https://app.cal.com/embed/embed.js", async: true }]);
  });

  it("queues namespace instructions where embed.js looks for them", () => {
    const { host } = fakeHost();
    const cal = installCalSnippet(host, "https://app.cal.com/embed/embed.js");
    cal("init", "book-1", { origin: "https://app.cal.com" });
    cal.ns["book-1"]?.("inline", { calLink: "kashuta/intro-ru" });

    expect(cal.q).toEqual([["initNamespace", "book-1"]]);
    expect(cal.ns["book-1"]?.q).toEqual([
      ["init", "book-1", { origin: "https://app.cal.com" }],
      ["inline", { calLink: "kashuta/intro-ru" }],
    ]);
  });

  it("keeps an existing namespace and an existing global Cal on re-run", () => {
    const { host } = fakeHost();
    const cal = installCalSnippet(host, "https://app.cal.com/embed/embed.js");
    cal("init", "book-1", {});
    const first = cal.ns["book-1"];
    cal("init", "book-1", {});

    expect(cal.ns["book-1"]).toBe(first);
    expect(installCalSnippet(host, "https://app.cal.com/embed/embed.js")).toBe(cal);
  });
});
