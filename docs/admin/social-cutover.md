# Social Autopost — Cutover Playbook

Pipeline status: shipped on branch `feat/social-autopost`, gated behind `SOCIAL_DRAFTS_ENABLED`. Default `false` — no traffic until you flip it.

## 0. Pre-flight

- Postgres reachable at `DATABASE_URL` (the docker-compose container or your prod instance).
- `pnpm install` clean.
- Node 20.12+ (matches existing `engines`).

## 1. Apply the migration

```bash
pnpm db:generate   # if you've made local schema edits, otherwise skip
pnpm db:migrate
```

Verify in `pnpm db:studio`: table `social_posts` exists with the partial unique index `ux_social_active_per_channel`.

## 2. Bootstrap your voice profile

The placeholder at `src/lib/social/voice/profile.md` is generic. Replace it with your real voice — the Editor stage is only as good as this file.

```bash
ANTHROPIC_API_KEY=sk-ant-... pnpm voice:draft
```

This reads up to 20 RU posts from `src/content/posts/`, asks Sonnet to summarise voice, and writes `src/lib/social/voice/profile.draft.md`. Review, edit, then:

```bash
mv src/lib/social/voice/profile.draft.md src/lib/social/voice/profile.md
git add src/lib/social/voice/profile.md
git commit -m "feat(social): voice profile from corpus"
```

Update `src/lib/social/voice/examples.json` and `banned-phrases.json` over time as you discover idiomatic patterns and AI tells.

## 3. OAuth — X and LinkedIn

```bash
pnpm social:auth:x          # follow URL, paste code, copy tokens to .env
pnpm social:auth:linkedin   # same flow
```

Required vars after the dance:

```bash
X_CLIENT_ID=...
X_CLIENT_SECRET=...
X_OAUTH_TOKEN=...
X_OAUTH_REFRESH=...
X_HANDLE=artka

LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
LINKEDIN_ACCESS_TOKEN=...
LINKEDIN_REFRESH_TOKEN=...
LINKEDIN_PERSON_URN=urn:li:person:...
```

`LINKEDIN_PERSON_URN` isn't returned by the OAuth flow itself — fetch it once via `GET https://api.linkedin.com/v2/userinfo` with the new token, copy the `sub` field.

## 4. Telegram bot

Manual one-shot:

1. Talk to `@BotFather` → `/newbot` → save token.
2. Add the bot to your channel as **admin** with **post messages** permission.
3. Set in `.env`:
   ```bash
   TELEGRAM_BOT_TOKEN=...
   TELEGRAM_CHANNEL_ID=@artka_blog   # or numeric -100... if private
   ```

## 5. Local smoke

With `ANTHROPIC_API_KEY` set, dry-run the pipeline against any RU post (no DB, no posting):

```bash
pnpm social:smoke <slug>
```

Inspect the output — the drafts and critic notes go to stdout. Iterate on `voice/profile.md`, `examples.json`, `banned-phrases.json` until the output reads like you, not like a model.

## 6. Trial run on staging

Set `SOCIAL_DRAFTS_ENABLED=true` in the staging `.env`. Publish a test post with `draft: true` (it won't appear on the public site) — `publish.one` still fires the social hook.

```bash
# tail logs while you click Publish
docker logs -f astro-blog-app
```

Open `/admin/social/<slug>`. Three rows should appear: `generating` then `pending`. Edit the X-EN draft, click Publish, check the resulting tweet on x.com. Same for LinkedIn and Telegram.

## 7. Production cutover

1. Merge the branch.
2. Set `SOCIAL_DRAFTS_ENABLED=true` in production `.env`.
3. Restart the app.
4. Publish a post normally. Drafts appear at `/admin/social`. Review and publish per channel.

## 8. Recovery cron

Schedule `pnpm social:recover` every 5 minutes. Example crontab inside the app container:

```
*/5 * * * * cd /app && pnpm social:recover >> /var/log/social-recover.log 2>&1
```

Or in Dokploy/Coolify add it as a scheduled task pointing at the same command.

It only does two things:
- `generating` older than 10 min → `failed` (process crashed mid-pipeline)
- `sending` older than 5 min with `external_id IS NULL` → back to `pending` with `retry_count++`

## 9. First-week observations

After 5 publications, sample the data:

```sql
SELECT channel,
       count(*) FILTER (WHERE status = 'sent') AS sent,
       count(*) FILTER (WHERE status = 'failed') AS failed,
       count(*) FILTER (WHERE status = 'skipped') AS skipped,
       avg(jsonb_array_length(critic_annotations)) AS avg_notes
  FROM social_posts
  GROUP BY channel;
```

If `failed` > 1 per channel, check `error_message` for OAuth refresh issues. If `avg_notes` exceeds 3, tighten Writer/Editor prompts or expand `banned-phrases.json`.

## 10. Rollback

`SOCIAL_DRAFTS_ENABLED=false` and restart. No data loss — existing rows in `social_posts` stay where they are. New `publish.one` calls skip the hook.

## Known deferred work

- E2E happy/error paths (`tests/e2e/social-flow*.spec.ts`) are skipped — they need dev-server SDK mocking. Action-level integration coverage is in place.
- OAuth token auto-refresh on 401 isn't wired; a 401 surfaces as `policy` error and you re-run `pnpm social:auth:*`. Add auto-refresh later if it bites.
- No analytics/reach dashboard. Inspect `social_posts` directly or query x.com/LinkedIn manually.
- Backfill of older posts: not implemented. Add `pnpm social:backfill --slug=...` when needed.
