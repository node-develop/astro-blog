# Postgres roles

Created by `drizzle/0007_triggers_and_roles.sql`.

| Role            | Used by                 | Grants                                                                                                            |
| --------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `app_writer`    | Hono API (`@artka/api`) | full RW on public schema                                                                                          |
| `app_reader`    | Astro frontend          | SELECT on public schema                                                                                           |
| `render_reader` | Render service          | SELECT on posts only                                                                                              |
| `agent_writer`  | Python agent service    | full on agent\_\*, posts RW, media_assets R, langgraph schema full. NO access to sessions/accounts/verifications. |

## Setting passwords

Default passwords in the migration are placeholders. After first apply on a real environment:

```sql
ALTER ROLE app_writer PASSWORD '<secure-random>';
ALTER ROLE app_reader PASSWORD '<secure-random>';
ALTER ROLE render_reader PASSWORD '<secure-random>';
ALTER ROLE agent_writer PASSWORD '<secure-random>';
```

Store the resulting `DATABASE_URL` per service in `.env.<service>` files (gitignored).
