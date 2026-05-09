import { describe, it, expect } from "vitest";
import {
  loadVoiceCard,
  getChannelExamples,
  getBannedPhrases,
  getPolicy,
} from "~/lib/social/voice/loader";

describe("voice loader", () => {
  it("loads profile.md as text", async () => {
    const card = await loadVoiceCard();
    expect(card.profile).toContain("Voice profile");
    expect(card.profile.length).toBeGreaterThan(100);
  });

  it("returns at least 1 example per channel", async () => {
    const x = await getChannelExamples("x_en");
    const li = await getChannelExamples("li_en");
    const tg = await getChannelExamples("tg_ru");
    expect(x.length).toBeGreaterThan(0);
    expect(li.length).toBeGreaterThan(0);
    expect(tg.length).toBeGreaterThan(0);
  });

  it("returns banned phrases for both langs", async () => {
    const banned = await getBannedPhrases();
    expect(banned.en.phrases).toContain("delve");
    expect(banned.ru.phrases).toContain("погружаться");
  });

  it("returns per-channel policy text", async () => {
    expect((await getPolicy("x_en")).length).toBeGreaterThan(50);
    expect((await getPolicy("li_en")).length).toBeGreaterThan(50);
    expect((await getPolicy("tg_ru")).length).toBeGreaterThan(50);
  });

  it("memoises across calls (same reference)", async () => {
    const a = await loadVoiceCard();
    const b = await loadVoiceCard();
    expect(a).toBe(b); // identity, not equality
  });
});
