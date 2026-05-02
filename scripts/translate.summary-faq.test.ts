import { describe, expect, it } from "vitest";
import { parseFrontmatter, serializeFrontmatter } from "../src/lib/content/frontmatter";

const sample = `---
title: Sample
description: Short description for the sample post used by tests.
pubDate: 2026-05-15
tags:
  - claude-code
  - skills
draft: false
summary: Краткий тезис в 60 символов и больше — это нужно для теста.
keywords:
  - harness
  - skills
faq:
  - question: Что такое harness?
    answer: Это runtime-контейнер. Здесь должно быть достаточно символов чтобы пройти валидацию.
  - question: Что такое skill?
    answer: Файл-инструкция. Здесь должно быть достаточно символов чтобы пройти валидацию.
lang: ru
---

Body text.
`;

describe("frontmatter round-trip — extended fields", () => {
  it("parses summary, keywords, faq, lang", () => {
    const { frontmatter } = parseFrontmatter(sample);
    expect(frontmatter.summary).toContain("Краткий тезис");
    expect(frontmatter.keywords).toEqual(["harness", "skills"]);
    expect(frontmatter.faq).toHaveLength(2);
    expect(frontmatter.faq?.[0]?.question).toBe("Что такое harness?");
    expect(frontmatter.lang).toBe("ru");
  });

  it("serialises round-trip without losing the new fields", () => {
    const { frontmatter, body } = parseFrontmatter(sample);
    const out = serializeFrontmatter(frontmatter, body);
    const reparsed = parseFrontmatter(out).frontmatter;
    expect(reparsed.summary).toBe(frontmatter.summary);
    expect(reparsed.keywords).toEqual(frontmatter.keywords);
    expect(reparsed.faq).toEqual(frontmatter.faq);
    expect(reparsed.lang).toBe("ru");
  });
});
