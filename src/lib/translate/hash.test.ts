import { describe, expect, it } from "vitest";
import { parseFrontmatter, serializeFrontmatter } from "../content/frontmatter";
import { contentHash } from "./hash";

const post = (frontmatter: string, body = "## Раздел\n\nТекст статьи.\n"): string =>
  `---\n${frontmatter}\n---\n\n${body}`;

const BASE = [
  'title: "Заголовок статьи"',
  'description: "Описание статьи для поиска."',
  'summary: "Короткая выжимка."',
  "pubDate: 2026-09-01",
  "updatedDate: 2026-09-02",
  "tags: [astro]",
  "keywords: [seo]",
  "cover: /covers/a.png",
  'coverAlt: "Схема"',
  "faq:",
  '  - question: "Вопрос?"',
  '    answer: "Ответ."',
].join("\n");

describe("contentHash: an EN twin goes stale only when translated content changes", () => {
  it.each([
    ["updatedDate", "updatedDate: 2026-09-02", "updatedDate: 2026-10-03"],
    ["tags", "tags: [astro]", "tags: [astro, seo]"],
    ["keywords", "keywords: [seo]", "keywords: [seo, json-ld]"],
    ["cover", "cover: /covers/a.png", "cover: /covers/b.png"],
  ])("a cosmetic edit of %s keeps the hash", (_field, from, to) => {
    expect(contentHash("posts", post(BASE.replace(from, to)))).toBe(
      contentHash("posts", post(BASE)),
    );
  });

  it.each([
    ["title", 'title: "Заголовок статьи"', 'title: "Другой заголовок"'],
    ["summary", 'summary: "Короткая выжимка."', 'summary: "Другая выжимка."'],
    ["coverAlt", 'coverAlt: "Схема"', 'coverAlt: "Диаграмма"'],
    ["faq answer", 'answer: "Ответ."', 'answer: "Другой ответ."'],
  ])("a change of %s changes the hash", (_field, from, to) => {
    expect(contentHash("posts", post(BASE.replace(from, to)))).not.toBe(
      contentHash("posts", post(BASE)),
    );
  });

  it("a body edit changes the hash", () => {
    expect(contentHash("posts", post(BASE, "## Раздел\n\nДругой текст.\n"))).not.toBe(
      contentHash("posts", post(BASE)),
    );
  });

  it("follows the fields of the collection: the home page hero and a project outcome count", () => {
    const home = (hero: string) => post(`title: "Главная"\nheroTitle: "${hero}"`);
    expect(contentHash("site", home("Привет"))).not.toBe(contentHash("site", home("Здравствуйте")));
    const project = (second: string) =>
      post(`title: "Проект"\noutcomes:\n  - "Первый итог"\n  - "${second}"`);
    expect(contentHash("projects", project("Второй итог"))).not.toBe(
      contentHash("projects", project("Иной итог")),
    );
  });

  it("keeps field boundaries: moving text between title and description is a change", () => {
    expect(contentHash("posts", post('title: "ab"\ndescription: "c"'))).not.toBe(
      contentHash("posts", post('title: "a"\ndescription: "bc"')),
    );
  });

  it("survives what editors and the admin form do to a file", () => {
    const source = post(BASE);
    const expected = contentHash("posts", source);
    // BOM + CRLF, trailing spaces and extra blank lines at the end.
    expect(contentHash("posts", `﻿${source.replace(/\n/g, "\r\n")}`)).toBe(expected);
    expect(contentHash("posts", `${source.replace("Текст статьи.", "Текст статьи.  ")}\n\n`)).toBe(
      expected,
    );
    // YAML style and an empty optional field are not content.
    expect(
      contentHash(
        "posts",
        post(BASE.replace('summary: "Короткая выжимка."', "summary: >-\n  Короткая выжимка.")),
      ),
    ).toBe(expected);
    expect(contentHash("posts", post('title: "T"\ncoverAlt: ""'))).toBe(
      contentHash("posts", post('title: "T"')),
    );
    // Admin round trip: posts.upsert parses the file and serialises it back.
    const parsed = parseFrontmatter(source);
    expect(contentHash("posts", serializeFrontmatter(parsed.frontmatter, parsed.body))).toBe(
      expected,
    );
  });
});
