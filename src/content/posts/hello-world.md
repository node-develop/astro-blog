---
title: Привет, мир
description: Первая публикация — проверяем Markdown, Mermaid и LaTeX
pubDate: 2026-04-23
tags:
  - meta
  - astro
draft: false
---

Это тестовый пост, чтобы убедиться, что рендеринг работает.

## Код

```ts
const greet = (name: string): string => `Hello, ${name}!`;
console.log(greet("world"));
```

## Mermaid-диаграмма

```mermaid
flowchart LR
    A[Markdown] -->|MDX| B(Astro)
    B --> C{Сборка}
    C -->|SSG| D[Статика]
    C -->|SSR| E[Острова]
```

## LaTeX

Встроенная формула: $E = mc^2$.

Блочная:

$$
\int_{0}^{\infty} e^{-x^2} \, dx = \frac{\sqrt{\pi}}{2}
$$

## Готово

Если всё выше отрендерилось корректно — конфиг `astro.config.ts` в порядке.
