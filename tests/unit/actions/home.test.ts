/**
 * Contract tests for `home.update` input validation and the HomeEditor
 * dirty-fields payload. No DB, no action runtime.
 */
import { describe, it, expect } from "vitest";
import { homeUpdateInput } from "~/actions/home";
import { buildHomePayload, type HomeData } from "~/components/admin/HomeEditor";

const valid = {
  locale: "ru" as const,
  heroTitle: "Привет",
  metaTitle: "Артём — блог",
  metaDescription: "Описание главной страницы длиннее десяти символов.",
};

describe("homeUpdateInput", () => {
  it("accepts the three required fields alone", () => {
    expect(homeUpdateInput.parse(valid)).toMatchObject(valid);
  });

  it("rejects an unknown locale", () => {
    expect(() => homeUpdateInput.parse({ ...valid, locale: "de" })).toThrow();
  });

  it("rejects an empty heroTitle", () => {
    expect(() => homeUpdateInput.parse({ ...valid, heroTitle: "" })).toThrow();
  });

  it("enforces metaTitle max(120) and metaDescription min(10)/max(200)", () => {
    expect(() => homeUpdateInput.parse({ ...valid, metaTitle: "x".repeat(121) })).toThrow();
    expect(homeUpdateInput.parse({ ...valid, metaTitle: "x".repeat(120) }).metaTitle).toHaveLength(
      120,
    );
    expect(() => homeUpdateInput.parse({ ...valid, metaDescription: "short" })).toThrow();
    expect(() => homeUpdateInput.parse({ ...valid, metaDescription: "x".repeat(201) })).toThrow();
  });

  it("keeps optional fields optional (absent stays absent — merge semantics)", () => {
    const parsed = homeUpdateInput.parse(valid);
    expect("heroLede" in parsed).toBe(false);
    expect(homeUpdateInput.parse({ ...valid, heroLede: "Lede" }).heroLede).toBe("Lede");
  });
});

describe("buildHomePayload (dirty fields only)", () => {
  const snapshot: HomeData = {
    heroTitle: "Hero",
    metaTitle: "Meta",
    metaDescription: "Meta description text.",
    heroLede: "Old lede",
    authorBio: "Old bio",
    courseTitle: "Course",
  };

  it("always sends the required fields, and only the changed optional ones", () => {
    const values: HomeData = { ...snapshot, authorBio: "New bio" };
    const payload = buildHomePayload(values, snapshot, "en");
    expect(payload).toEqual({
      locale: "en",
      heroTitle: "Hero",
      metaTitle: "Meta",
      metaDescription: "Meta description text.",
      authorBio: "New bio",
    });
    // Untouched fields are NOT sent, so a stale tab cannot overwrite them.
    expect("heroLede" in payload).toBe(false);
    expect("courseTitle" in payload).toBe(false);
  });

  it("sends nothing optional when the form is unchanged", () => {
    const payload = buildHomePayload(snapshot, snapshot, "ru");
    expect(Object.keys(payload).sort()).toEqual(
      ["heroTitle", "locale", "metaDescription", "metaTitle"].sort(),
    );
  });

  it("produces a payload the server schema accepts", () => {
    const values: HomeData = {
      ...snapshot,
      metaDescription: "A brand new meta description.",
      heroCta: "Read",
    };
    const payload = buildHomePayload(values, snapshot, "ru");
    expect(homeUpdateInput.parse(payload)).toEqual(payload);
  });
});
