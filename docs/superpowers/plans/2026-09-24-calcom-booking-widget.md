# Cal.com Booking Widget Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Budget: ≤ 12 files touched, one PR.

**Goal:** Let visitors of artka.dev book a meeting slot from the owner's real calendar without leaving the site, in RU and EN, without loading third-party JavaScript for readers who never asked for it.

**Architecture:** Cal.com Cloud owns availability, calendar sync, booking, confirmation emails, video links and reschedule/cancel. The site only embeds the Cal.com booker via the vanilla `embed.js` snippet inside one Astro component, `BookingWidget.astro`, mounted in a new `#book` section of `/contact/` and `/en/contact/`. The embed loads on explicit click (a facade), follows the site theme, and reports a PII-free `Booking` event to Plausible. There is no backend code, DB table, API key or LLM call.

**Tech Stack:** Cal.com Cloud + `embed.js` (vanilla snippet, no npm dependency), Astro component with a bundled `<script>` (same pattern as `ThemeToggle.astro`), Vitest, Playwright.

---

## Research summary

### Embed options Cal.com offers (verified against `calcom/cal.com` source, `packages/embeds/*`)

| Option                                                      | What it is                                                                                                                       | Verdict                                                                                                                                                                |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vanilla snippet, `inline`**                               | `Cal("init", ns, {origin})` + `Cal.ns[ns]("inline", {elementOrSelector, calLink, config})` renders the booker iframe in a `div`. | **Chosen.** Zero dependencies, same pattern as giscus; works with `ClientRouter`.                                                                                     |
| Vanilla snippet, `floatingButton` / element-click (`data-cal-link`) | Modal booker opened by a floating button or any element.                                                                  | Good for a site-wide CTA later; a modal over the poster design is noisier than an inline section, and a floating button on every page loads third-party JS everywhere. |
| `@calcom/embed-react` (v1.3.3)                              | React wrapper around the same snippet.                                                                                           | Rejected: adds a React island + dependency just to render an iframe; the site keeps islands for real interactivity.                                                    |
| `@calcom/atoms` `BookerEmbed`                               | Native React booker via Cal.com Platform (OAuth client).                                                                         | Rejected: needs a Platform plan, OAuth client and managed users. Far too heavy for one person's calendar.                                                             |
| API v2 + custom UI                                          | Own slot picker calling Cal.com API with a secret key.                                                                           | Rejected: re-implements the booker, needs secrets and an SSR endpoint, and the UI has to be maintained.                                                      |
| Self-hosted Cal.com on Dokploy                              | Open-source edition + its own Postgres.                                                                                         | Rejected for now: a second stateful service to run and patch, all for one user. Cloud's free individual tier covers this use case.                                   |

### Embed API facts the implementation relies on

- Loader script: `https://app.cal.com/embed/embed.js` (EU data region: `https://app.cal.eu/embed/embed.js`, origin `https://app.cal.eu`). The snippet appends it on the first `Cal()` call and queues instructions until it loads.
- `Cal("init", "<namespace>", { origin })`: a namespace isolates our instance (`Cal.ns.book`). Re-running the snippet does not override an existing namespace, which matters with `ClientRouter` page swaps.
- `Cal.ns.book("inline", { elementOrSelector, calLink: "<user>/<event>", config })`: `config` holds booker query params: `layout` (`month_view` | `week_view` | `column_view`), `theme` (`light` | `dark` | `auto`), `useSlotsViewOnSmallScreen: "true"`, plus prefill keys (`name`, `email`, `notes`, `guests`, `metadata[key]`).
- `Cal.ns.book("ui", { theme, hideEventTypeDetails, layout, cssVarsPerTheme: { light: {...}, dark: {...} }, styles: { branding: { brandColor } } })` can be called again at any time to re-theme a live embed.
- Events: `Cal.ns.book("on", { action, callback })`, where `callback(e)` reads `e.detail.data`. Actions we use:
  - `linkReady`: iframe is ready, so hide our loader.
  - `linkFailed` (`{code, msg, data:{url}}`): show the fallback link and report it.
  - `bookingSuccessfulV2` (`{uid, title, startTime, endTime, eventTypeId, status, paymentRequired, isRecurring, videoCallUrl?}`): the lightweight, documented successor to the deprecated `bookingSuccessful`.
- The iframe is cross-origin, so it cannot read our CSS custom properties. Brand colours must be passed as literal values (read with `getComputedStyle` at mount time).

### Constraints found in the codebase

- `/contact/` and `/en/contact/` are **prerendered** (`output: "static"`, no `prerender = false`). The component must work as static HTML plus client script, and no server data is available at request time.
- `BaseLayout` uses `<ClientRouter />`, so mounting must hook `astro:page-load` and be idempotent (`data-mounted`), exactly like `Comments.astro`.
- Theme lives on `<html data-theme="dark">` and `ThemeToggle` dispatches a `themechange` CustomEvent. Listen to it and call `Cal.ns.book("ui", { theme })`.
- `src/middleware.ts` sets `Content-Security-Policy-Report-Only` with `frame-src https://giscus.app`. It only decorates SSR responses (prerendered `/contact/` is served as a static file), but the policy should list Cal.com now so promoting it to enforcing later does not silently break booking on SSR pages.
- Adding a **new** site page (`/meet/`) would touch `SITE_ENTRY_PAGES`, `sitemap.ts`, `og/landing-pages.ts`, llms outputs, title-budget/og-path/agent-trust tests and a translate twin. Putting the booker in `/contact/` touches none of those registries. The Cal.com public link (`cal.com/<user>`) is already a shareable direct URL.
- LLM rules: no LLM calls are involved, so the "Judgment-only" list in `CLAUDE.md` is unchanged.
- The privacy page (`src/content/site/privacy.md`) enumerates every external processor (Plausible, Giscus/GitHub, Buttondown). Cal.com must be added there, and its EN twin regenerated with `pnpm translate`.

---

## Decisions (defaults; confirm in "Open questions")

1. **Placement:** a `## Book a call` section at `#book` on `/contact/` and `/en/contact/`, rendered after `<Content />`. Plain-link CTAs (`/contact/#book`) from `/about/` and the home author card go in a follow-up, not this PR.
2. **Facade, not autoload:** the section renders a short lede, a primary button "Choose a time" / «Выбрать время», and a plain fallback link to `https://cal.com/<user>/<event>`. `embed.js` is injected only after the click. Readers who just want the email address never contact Cal.com. The privacy text stays honest ("loaded only after you press the button"), and there is no LCP/INP cost on the contact page.
3. **Configuration is code, not env:** `src/lib/booking/config.ts` exports `CAL_ORIGIN`, `CAL_EMBED_URL`, `CAL_NAMESPACE = "book"`, and `calLinkFor(locale)`. These values are public, so they don't belong in `.env`. Same reasoning as `CANONICAL_ORIGIN` in `url-policy.ts`.
4. **Locale:** one event type per language (`kashuta/intro-ru`, `kashuta/intro-en`) so the event title, description and booking questions are in the reader's language. The booker chrome language follows the visitor's browser (Cal.com behaviour).
5. **Theme and brand:** pass `theme` from `data-theme`. `cssVarsPerTheme` sets `cal-brand` to the computed `--color-accent` (ultramarine, AA on paper) for light, and to its dark-theme value for dark. `--cal-brand-text` comes from the matching ink token. Lime `--color-fill` is a field colour per `tokens.css`, not a button colour, so it is not used here.
6. **Analytics:** on `bookingSuccessfulV2`, call `window.plausible?.("Booking", { props: { locale } })`. Never forward `uid`, name, email or times. On `linkFailed`, call `plausible("BookingEmbedFailed")` and reveal the fallback link.
7. **Layout:** `month_view` on desktop, `useSlotsViewOnSmallScreen: "true"` for phones. The section width is the article's 720px, so `hideEventTypeDetails: false` keeps title/duration visible above the calendar.

---

## Owner-gated setup on Cal.com (manual, before merge)

- [x] Cal.com Cloud account exists: **`kashuta`**, US region (public link `https://cal.com/kashuta`, so `CAL_ORIGIN = "https://app.cal.com"`, `CAL_EMBED_URL = "https://app.cal.com/embed/embed.js"`).
- [ ] Connect the calendar(s) under *Apps → Calendars*: Google / Outlook / iCloud (CalDAV). Turn on conflict checking for every calendar that holds busy time, and pick one as the destination for new bookings.
- [ ] Set *Availability*: working hours, timezone (bookers see slots in their own TZ automatically), date overrides.
- [ ] Create event types `intro-ru` and `intro-en` (e.g. 30 min):
  - location: Cal Video / Google Meet / Zoom;
  - limits: minimum notice (e.g. 24h), before/after buffers, max bookings per day, booking window (e.g. 30 days);
  - booking questions: name, email, "What do you want to discuss?" (required, so the call has an agenda);
  - optional **Requires confirmation**: the owner approves every request, which protects against spam slots;
  - reminder email workflow (optional).
- [ ] Make a test booking through the public link and cancel it, to confirm calendar write-back and emails.
- [ ] Record the final `calLink` values and region in the PR description.

---

## File structure

- `src/lib/booking/config.ts` (new): origin, embed URL, namespace, `calLinkFor(locale)`, `buildUiConfig(theme, palette)` (pure).
- `tests/unit/booking/config.test.ts` (new): locale → link mapping, theme/palette → `ui` payload.
- `src/components/BookingWidget.astro` (new): facade markup, `is:inline` loader + mount + theme sync + events, scoped styles on tokens.
- `src/pages/contact.astro`, `src/pages/en/contact.astro`: render `<BookingWidget locale={locale} />` after `<Content />`.
- `src/i18n/strings.ru.json` (+ EN via `pnpm translate`): `booking.title`, `booking.lede`, `booking.cta`, `booking.fallback`, `booking.loading`, `booking.error`.
- `src/middleware.ts`: add the Cal.com origin to `script-src`, `frame-src`, `connect-src` of `CSP_REPORT_ONLY`.
- `src/content/site/privacy.md` (+ EN twin via `pnpm translate`): Cal.com paragraph under "Внешние сервисы и ссылки", and bump "Последнее обновление".
- `src/content/site/contact.md` (+ EN twin): one sentence pointing to the booking section below.
- `tests/e2e/booking.spec.ts` (new): stubbed-network behaviour.

---

### Task 1: Pure config + unit tests

- [ ] Run `gitnexus_impact` on nothing yet (new module only). Write `tests/unit/booking/config.test.ts` first:
  - `calLinkFor("ru") === "kashuta/intro-ru"`, `calLinkFor("en") === "kashuta/intro-en"`;
  - `buildUiConfig("dark", palette)` returns `theme: "dark"` and a `cssVarsPerTheme.dark["cal-brand"]` equal to the palette value passed in, so a token change changes the output and the test fails if the mapping is dropped;
  - `CAL_EMBED_URL` starts with `CAL_ORIGIN` (guards against mixing US/EU hosts, which fails silently as `linkFailed`).
- [ ] Implement `src/lib/booking/config.ts` as plain exported functions and `as const` data (no classes; `Readonly` return types).
- [ ] Verify: `pnpm test tests/unit/booking`, `pnpm typecheck`.

### Task 2: `BookingWidget.astro`

- [ ] Markup (server-rendered, works without JS):
  ```astro
  <section id="book" class="booking" aria-labelledby="booking-heading">
    <h2 id="booking-heading">{t(locale, "booking.title")}</h2>
    <p>{t(locale, "booking.lede")}</p>
    <button type="button" data-booking-open>{t(locale, "booking.cta")}</button>
    <a href={publicUrl} rel="noopener" data-booking-fallback>{t(locale, "booking.fallback")}</a>
    <div data-booking-mount data-cal-link={calLink} hidden aria-busy="true"></div>
    <p data-booking-status role="status" aria-live="polite"></p>
  </section>
  ```
- [ ] `<script is:inline define:vars={{ calOrigin, embedUrl, namespace, calLink, locale }}>` (same approach as `Comments.astro` because of `define:vars`):
  - on click: paste the official loader IIFE (verbatim from `embed-snippet/src/index.ts`, with `embedUrl`), call `Cal("init", namespace, { origin: calOrigin })`, then `Cal.ns[namespace]("inline", { elementOrSelector: mount, calLink, config: { layout: "month_view", useSlotsViewOnSmallScreen: "true", theme } })`, then `("ui", uiConfig)`;
  - read palette values with `getComputedStyle(document.documentElement)` for `--color-accent` / on-accent ink, so the iframe gets literal colours;
  - `on linkReady` → unhide mount, clear `aria-busy`, hide button, move focus to the section heading;
  - `on linkFailed` → keep the fallback link visible, set status text `booking.error`, `plausible("BookingEmbedFailed")`;
  - `on bookingSuccessfulV2` → `plausible("Booking", { props: { locale } })` only;
  - `themechange` listener → `Cal.ns[namespace]("ui", { theme })`, registered once (guard flag on `window`, because `ClientRouter` re-executes inline scripts);
  - `astro:page-load` re-binds the click handler idempotently (`data-mounted`).
  - Inline scripts cannot import `buildUiConfig`, so the tested function can't be reused client-side. Serialize its output server-side for both themes via `define:vars` and only substitute the computed colours on the client. That keeps the logic tested and the inline script thin.
- [ ] Styles: scoped, tokens only (`--space-*`, `--font-mono` label, `--stroke-hair` top rule like `.comments`), `min-height` on the mount to avoid CLS when the iframe appears. Run the `ui-design-review` skill on the result (contrast of the button in both themes, focus ring, 320px width).
- [ ] Verify: `pnpm typecheck`, `pnpm lint`.

### Task 3: Wire into contact pages + copy

- [ ] Add `booking.*` keys to `src/i18n/strings.ru.json`. Run `pnpm translate` to get the EN keys and commit both.
- [ ] Render `<BookingWidget locale={locale} />` after `<Content />` in `src/pages/contact.astro` and `src/pages/en/contact.astro` (inside the existing 720px container).
- [ ] One sentence in `src/content/site/contact.md` ("Можно также выбрать время для созвона — ниже"). Run `pnpm translate` and `pnpm translate:check`. Check `tests/unit/seo/review-followups.test.ts`, which asserts on contact.md content.
- [ ] Verify: `pnpm build` (prerendered contact page contains `#book`, fallback link, and no `embed.js` `<script src>`), `pnpm test`.

### Task 4: CSP + privacy

- [ ] `gitnexus_impact` on `securityHeaders` (expected LOW: one module). Add `CAL_ORIGIN` to `script-src`, `frame-src`, `connect-src` in `CSP_REPORT_ONLY` by importing the constant from `src/lib/booking/config.ts` rather than duplicating the string.
- [ ] Privacy paragraph (RU source): what goes to Cal.com (name, email, meeting notes, chosen time, technical request data), why (scheduling the meeting and sending confirmations), that Cal.com and the connected calendar provider process it under their own policies (link Cal.com privacy policy), that the widget loads only after the button is pressed, and how to cancel or delete a booking (the link in the confirmation email, or a message to a@artka.dev). Update the "last updated" date. Run `pnpm translate`.
- [ ] Verify: `pnpm test` (title-budget / agent-trust tests over privacy still pass), `pnpm translate:check`.

### Task 5: E2E

- [ ] `tests/e2e/booking.spec.ts`, fully offline via `page.route`:
  - no request to `CAL_ORIGIN` happens before the click (asserts the privacy promise);
  - stub `embed.js` with a tiny script that records `Cal.q` instructions on `window.__calCalls`. After the click, assert `init` used our origin and namespace, and `inline` used `calLinkFor(locale)` for both `/contact/` and `/en/contact/`;
  - toggling the theme queues a `ui` instruction with `theme: "dark"`;
  - with `embed.js` routed to `abort()`, the fallback link stays visible and the status text is shown;
  - `a11y.spec.ts`: add `/contact/` to the axe routes if it isn't covered already.
- [ ] Verify: `pnpm test:e2e booking`.

### Task 6: Final checks

- [ ] `gitnexus_detect_changes()`: only the files above.
- [ ] `critic` agent review of the diff.
- [ ] `deploy-check` skill; after deploy, make one real booking on production and cancel it, then check that the Plausible `Booking` goal registers (add the goal in Plausible UI).

---

## Open questions for the owner

1. **Event slugs.** Username is `kashuta`. Which event types exist at `cal.com/kashuta`? Default: create `intro-ru` and `intro-en` (30 min). If only one event exists, `calLinkFor` returns it for both locales.
2. **Region: resolved.** The account is on US Cloud (`cal.com/kashuta`). Moving to EU would mean a new `app.cal.eu` account; the privacy paragraph states the US processor.
3. **Free vs paid meetings.** Cal.com can take Stripe payments per event type. This plan assumes free intro calls. Paid consultations need only a Cal.com setting; the embed and `paymentRequired` in `bookingSuccessfulV2` already handle it.
4. **Require manual confirmation?** Recommended for a public personal calendar.
5. **Reachability for RU readers.** Check that `app.cal.com` and the chosen video provider load from Russia without a VPN. If they don't, the fallback email stays the primary path and the lede should say so.
6. **Later:** site-wide CTA (`/about/`, home author card) linking to `/contact/#book`; Cal.com webhooks (`BOOKING_CREATED`) into `/api/*` for an admin feed. That would need a signed-secret endpoint and is out of scope until there's a need beyond Cal.com's own emails.

---

## Owner decisions (2026-09-24) and implementation notes

- Events `kashuta/intro-ru` and `kashuta/intro-en`, 30 min, free, **requires confirmation**; placement on `/contact/#book`.
- Added: a secondary masthead CTA on the home page (RU «Назначить встречу», EN "Let's meet") linking to `/contact/#book`, visible on desktop and mobile. Its label is the `booking.homeCta` UI string, not a home.md field: adding a field to `/admin/home` would touch ~10 files (schema, editor, action, translate pipeline, both home.md). Move it into `/admin/home` if the owner wants to edit it there.
- Deviation from Task 2: the client script is a bundled `<script>` (like `ThemeToggle.astro`), not `is:inline`, so it imports the unit-tested `src/lib/booking/config.ts` and the typed snippet port `src/lib/booking/snippet.ts` directly. Each mount uses a fresh namespace (`book-N`) so a ClientRouter return to `/contact/` gets its own iframe.
- Brand colours are literals in `BRAND_PALETTE`; `tests/unit/booking/config.test.ts` fails if `--color-accent` in `tokens.css` drifts from them.
- EN strings and the EN contact/privacy twins were written by hand (no API key in the session); `.strings.hashes.json` and the twins' `sourceHash` were refreshed so `pnpm translate` does not re-translate them.

