---
name: db-migration
description: Создать и применить миграцию Drizzle ORM для PostgreSQL 18. Используй, когда пользователь хочет "добавить таблицу", "изменить схему", "миграция БД".
allowed-tools: ["Read", "Write", "Edit", "Bash(pnpm:*)", "Bash(ls:*)", "Bash(cat:*)"]
---

# Миграция Drizzle

## Шаги

1. **Прочитай** текущую схему: `src/lib/db/schema.ts`.
2. **Отредактируй схему** — добавь/измени таблицу/колонку.
3. **Сгенерируй миграцию**:
   ```bash
   pnpm db:generate
   ```
   Это создаст `drizzle/NNNN_<имя>.sql` и обновит `drizzle/meta/_journal.json`.
4. **Посмотри сгенерированный SQL** — убедись, что миграция делает что ожидаешь.
5. **Применить локально**:
   ```bash
   pnpm db:migrate
   ```
6. **Проверить** через `pnpm db:studio` или psql.
7. **Закоммить** вместе: изменения schema.ts + файлы в `drizzle/`.

## Шаблон таблицы

```ts
// src/lib/db/schema.ts
import { pgTable, uuid, text, timestamp, boolean, index } from "drizzle-orm/pg-core";

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    contentMdx: text("content_mdx").notNull(),
    published: boolean("published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: index("posts_slug_idx").on(t.slug),
    publishedIdx: index("posts_published_idx").on(t.published),
  }),
);

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
```

## Правила

- **UUID по умолчанию** для всех PK (`defaultRandom()`).
- **Timestamps с TZ**: `timestamp({ withTimezone: true })`.
- **Индексы явно** для всех колонок, по которым часто фильтруем.
- **Foreign keys с on-delete**: `.references(() => users.id, { onDelete: "cascade" })`.
- **Имена в snake_case** в БД, camelCase в TS (первый аргумент `pgTable`/колонок — имя в БД).
- **Никогда** не редактируй уже применённые миграции в `drizzle/` — создавай новую.

## Опасные операции

- `DROP COLUMN` в prod — данные потеряны. Делай в два шага: переименовать → в следующем релизе удалить.
- `NOT NULL` на существующую колонку — нужен default или backfill миграция.
- Большие индексы — делай `CREATE INDEX CONCURRENTLY` вручную (drizzle-kit не всегда делает).

## Чеклист

- [ ] Схема обновлена в `src/lib/db/schema.ts`
- [ ] `pnpm db:generate` создал миграцию
- [ ] Просмотрел SQL, нет неожиданных изменений
- [ ] `pnpm db:migrate` локально прошёл
- [ ] Запрос через Drizzle типизирован
- [ ] В коммит попали schema.ts + drizzle/NNNN\_\*.sql + \_journal.json
