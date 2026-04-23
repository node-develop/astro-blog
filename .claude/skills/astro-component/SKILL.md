---
name: astro-component
description: Создать новый Astro-компонент в src/components/ с типизированными props, Tailwind-стилями и опциональным client island. Используй, когда пользователь просит "добавь компонент", "сделай UI-элемент".
allowed-tools: ["Read", "Write", "Edit", "Grep", "Glob"]
---

# Новый Astro-компонент

## Шаги

1. **Определи тип компонента**:
   - **Static `.astro`** — по умолчанию (0 JS на клиенте)
   - **Island** (`.tsx`/`.svelte`) — только если нужна клиентская интерактивность (form, state, event handlers)
2. **Проверь существующие** компоненты через `Grep`/`Glob` — возможно, можно переиспользовать.
3. **Создай файл** в `src/components/<PascalCase>.astro` (или `.tsx` для island).
4. **Определи props через TS interface** (именно `interface`, не `type` — для Astro это рекомендация).
5. **Tailwind 4** классы, никакого `@apply` в компоненте.
6. **Импорт** в нужной странице/layout.

## Шаблон `.astro`

```astro
---
interface Props {
  title: string;
  variant?: "primary" | "secondary";
  class?: string;
}

const { title, variant = "primary", class: className = "" } = Astro.props;

const variantClasses = {
  primary: "bg-indigo-600 text-white",
  secondary: "bg-slate-200 text-slate-900",
} as const;
---

<div class:list={["rounded-lg p-4", variantClasses[variant], className]}>
  <h3 class="text-lg font-semibold">{title}</h3>
  <slot />
</div>
```

## Шаблон island (React)

```tsx
// src/components/Counter.tsx
interface CounterProps {
  initial?: number;
}

export default function Counter({ initial = 0 }: CounterProps) {
  const [count, setCount] = useState(initial);
  return (
    <button
      onClick={() => setCount((c) => c + 1)}
      className="rounded bg-indigo-600 px-3 py-1 text-white"
    >
      count: {count}
    </button>
  );
}
```

Использование: `<Counter client:idle />` — island загрузится в idle.

## Принципы

- **Функциональные компоненты только** (никаких `class Component`).
- **Props — readonly**, ничего не мутируем.
- **a11y**: семантические теги, aria-атрибуты где нужны.
- **Client directives** — минимально: `client:idle` > `client:visible` > `client:load`. Только когда реально нужно.

## Чеклист

- [ ] Props типизированы через `interface`
- [ ] `class?: string` в props для прокидывания стилей снаружи
- [ ] Вариативность через объекты/функции, не через if-else лестницы
- [ ] `pnpm typecheck` зелёный
- [ ] Если island — оправдан ли `client:*`? 0 JS по умолчанию всегда лучше
