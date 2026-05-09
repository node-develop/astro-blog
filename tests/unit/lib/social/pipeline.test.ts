import { describe, it, expect, vi, beforeEach } from "vitest";
import { ok, err, generationError } from "~/lib/social/errors";
import type { Article } from "~/lib/social/types";

vi.mock("~/lib/social/writers/x-en", () => ({
  writeXEn: vi.fn().mockResolvedValue(ok({ body: "x", mediaUrl: null })),
}));
vi.mock("~/lib/social/writers/linkedin-en", () => ({
  writeLiEn: vi.fn().mockResolvedValue(ok({ body: "li body".repeat(300), mediaUrl: null })),
}));
vi.mock("~/lib/social/writers/telegram-ru", () => ({
  writeTgRu: vi.fn().mockResolvedValue(ok({ body: "tg body".repeat(60), mediaUrl: null })),
}));
vi.mock("~/lib/social/editors/x-en", () => ({
  editXEn: vi.fn(async (_a: unknown, d: { body: string; mediaUrl: string | null }) =>
    ok({ ...d, body: d.body + " (edited)" }),
  ),
}));
vi.mock("~/lib/social/editors/linkedin-en", () => ({
  editLiEn: vi.fn(async (_a: unknown, d: unknown) => ok(d)),
}));
vi.mock("~/lib/social/editors/telegram-ru", () => ({
  editTgRu: vi.fn(async (_a: unknown, d: unknown) => ok(d)),
}));
vi.mock("~/lib/social/critic", () => ({
  runCritic: vi.fn().mockResolvedValue({ x_en: [], li_en: [], tg_ru: [] }),
  hasBlockAnnotations: vi.fn(),
}));

const article: Article = {
  collection: "posts",
  slug: "x",
  title: "T",
  summary: "S",
  body: "B",
  tags: [],
  pubDate: new Date(),
  cover: null,
  lang: "ru",
  sourceUrl: "u",
  hasEnTwin: true,
};

describe("runPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns drafts + annotations for all 3 channels", async () => {
    const { runPipeline } = await import("~/lib/social/pipeline");
    const r = await runPipeline({ article, channels: ["x_en", "li_en", "tg_ru"] });
    expect(Object.keys(r.drafts).sort()).toEqual(["li_en", "tg_ru", "x_en"]);
    expect(r.drafts.x_en?.ok).toBe(true);
    if (r.drafts.x_en?.ok) expect(r.drafts.x_en.value.body).toContain("(edited)");
    expect(r.annotations.x_en).toEqual([]);
  });

  it("only runs editors and critic for successful writers", async () => {
    const { writeXEn } = await import("~/lib/social/writers/x-en");
    const { editXEn } = await import("~/lib/social/editors/x-en");
    const { runCritic } = await import("~/lib/social/critic");
    (writeXEn as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      err(generationError("writer", "x_en", "boom")),
    );

    const { runPipeline } = await import("~/lib/social/pipeline");
    const r = await runPipeline({ article, channels: ["x_en", "li_en", "tg_ru"] });

    expect(editXEn).not.toHaveBeenCalled(); // editor skipped on writer failure
    expect(runCritic).toHaveBeenCalledTimes(1); // critic still runs for li_en + tg_ru
    expect(r.drafts.x_en?.ok).toBe(false);
    expect(r.drafts.li_en?.ok).toBe(true);
  });

  it("respects subset of channels", async () => {
    const { runPipeline } = await import("~/lib/social/pipeline");
    const r = await runPipeline({ article, channels: ["tg_ru"] });
    expect(Object.keys(r.drafts).sort()).toEqual(["tg_ru"]);
    expect(r.drafts.x_en).toBeUndefined();
  });

  it("skips critic if no successful drafts", async () => {
    const { writeXEn } = await import("~/lib/social/writers/x-en");
    const { writeLiEn } = await import("~/lib/social/writers/linkedin-en");
    const { writeTgRu } = await import("~/lib/social/writers/telegram-ru");
    const { runCritic } = await import("~/lib/social/critic");
    (writeXEn as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      err(generationError("writer", "x_en", "1")),
    );
    (writeLiEn as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      err(generationError("writer", "li_en", "2")),
    );
    (writeTgRu as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      err(generationError("writer", "tg_ru", "3")),
    );

    const { runPipeline } = await import("~/lib/social/pipeline");
    const r = await runPipeline({ article, channels: ["x_en", "li_en", "tg_ru"] });

    expect(runCritic).not.toHaveBeenCalled();
    expect(r.annotations).toEqual({ x_en: [], li_en: [], tg_ru: [] });
  });
});
