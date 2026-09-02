# ZOLOOP

The internet picks the winner. Head-to-head product battles, voted on by
real people, ranked by rating.

## Stack

- Next.js 15.3.6 (Pages Router)
- Tailwind CSS
- Supabase (Postgres + Storage)
- Deployed on Vercel

## Setup

1. Install dependencies:

   ```
   npm install
   ```

2. In the Supabase SQL editor:

   - **First-time setup** (brand new database): run the whole
     `supabase-schema.sql` file top to bottom, then
     `supabase-migration-description-limit.sql`, then `supabase-seed.sql`,
     then enable Row Level Security on `products`, `categories`,
     `battles`, `votes` (Table Editor → each table → RLS toggle) and run
     `supabase-rls.sql`.
   - **Already-running database** (you've run an earlier version of this
     file before): do **NOT** re-run the whole file — the `create table`
     statements near the top aren't safe to repeat and will fail with
     `relation "..." already exists`. Instead, run only the two
     `-- ---------- migration ...` blocks near the bottom of
     `supabase-schema.sql` (everything from the first
     `-- ---------- migration` comment to the end of the file). Both
     migration blocks are idempotent — safe to run again even if you're
     not sure whether you already ran them. Then re-run `supabase-seed.sql`
     (also idempotent) to pick up the new category list.

3. One-time Storage setup: in the Supabase dashboard, go to
   **Storage → New bucket**, name it `logos`, mark it **public**, and set
   the bucket's file type restriction to **PNG only** with a **2MB** size
   limit — that matches the limits enforced in `pages/api/submit-product.js`.
   If you skip this step, logo uploads fail with a `Bucket not found`
   error (visible in your logs, see below) until the bucket exists.

4. Copy `.env.local.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from
     Supabase Settings → API (safe to expose, RLS limits what it can do)
   - `SUPABASE_SERVICE_ROLE_KEY` — same page, the `service_role` key.
     **Never** prefix this with `NEXT_PUBLIC_` or it'll ship to the
     browser. Keep it out of any public chat, repo, or screenshot.

5. Run locally:

   ```
   npm run dev
   ```

6. Deploy: push to GitHub, import in Vercel, add the same three env vars
   in the Vercel project settings, deploy.

## What's here (MVP scope)

- `products`, `categories`, `battles`, `votes` tables
- RLS: `anon` can only read; all writes go through the service-role key,
  used exclusively inside `pages/api/*.js` server routes
- **Rating system** (`elo.js`): dynamic Elo. New products start at 1000,
  floored at 0 — a win against a stronger opponent moves your rating more
  than a win against a weaker one. Ratings update per individual vote
  with a small K-factor (4) rather than once per completed battle, since
  a battle can accumulate hundreds of votes. Existing products from
  before the 1000 baseline shipped keep whatever rating they already had.
- **Matchmaking gate**: two products can only battle if their ratings are
  within 200 points of each other (`isMatchAllowed` in `elo.js`),
  enforced server-side in `pages/api/vote.js` at battle-creation time.
- **Rematch cooldown**: the same pairing, under the *same battle
  question*, can't create a new battle while one between them is still
  live, or if they fought over that exact question within the last 24h.
  The same two products CAN run separate simultaneous battles under
  different questions (e.g. "best for coding" vs "best for writing").
- **Battle duration**: required at creation — 1 hour, 24 hours, or 7
  days, chosen from a fixed whitelist server-side (never a client-sent
  timestamp). `starts_at`/`ends_at` are stored and shown on the battle
  card. Once `ends_at` passes, the battle is lazily flipped from `live`
  to `completed` (with a winner set from whichever side had more votes,
  or no winner if tied) the next time anyone loads it — no cron job.
- **Battle question**: every battle stores the specific question it's
  settling (`battles.question`), shown on the battle card. Defaults to
  "Which is better: A or B?" if the person doesn't customize it.
- **Views**: every `/battle/[slug]` page load increments that battle's
  `views` counter, shown alongside its vote count. A `clicks` column
  also exists on `battles` for future website-click tracking, but
  nothing writes to it yet — no click-tracking redirect endpoint has
  been built.
- **Fuzzy, typo-tolerant product search**: `search_products()` (a
  Postgres function defined in `supabase-schema.sql`, using the
  `pg_trgm` extension) ranks results by string similarity, not just
  substring match — catches things like "chatgtp" or partial spelling.
  Also checks a `products.aliases` column for exact alias matches (e.g.
  "GPT" → ChatGPT), though there's no UI yet for adding aliases — the
  column just exists for now, fillable manually via the Supabase table
  editor.
- Server-side voting (`pages/api/vote.js`) with 1-vote-per-IP-per-battle
  dedup and rating updates on every vote
- Product creation (`pages/api/submit-product.js`, `POST`) — only name,
  website URL, and category are required. **Description and logo are
  optional**: if left blank, the server fetches the website's Open Graph
  tags (`og:description`, `og:image`, falling back to `/favicon.ico`)
  and uses those instead, converting any image to PNG via `sharp`. A
  manually provided description or uploaded PNG logo always overrides
  the auto-fetched one. If auto-fetch fails and no description was
  given, product creation is rejected with a message asking for one —
  a completely blank description everywhere isn't allowed, but a missing
  logo is fine (falls back to a letter avatar in the UI).
  **Auto-publishes immediately** — no review queue.
- Product search + recommendations (`pages/api/submit-product.js`, `GET`)
  — `?q=text` for fuzzy search, `?category=id` for top-rated products in
  a category. Either battle slot can be filled first — there's no "your
  product" concept since this app has no accounts, so nothing is
  actually owned by anyone.
- Battle creation (`pages/api/vote.js`, `POST` with `action: "create"`) —
  takes two existing product ids, an optional custom question, and a
  required duration, creates a `status: "live"` battle immediately, no
  approval step.
- Homepage "Challenge a competitor" flow: one input —
  `yourproduct.com vs competitor.com` — parsed on the literal word " vs "
  between the two terms. Runs a fuzzy search for both sides at once, each
  showing results to pick from or a `+ Add "{term}"` inline mini-form if
  nothing matches. Once both sides are resolved, shows an editable
  battle-question field and the required duration picker, then
  "Create Battle". A "Categories" tab sits beside it, same
  toggle-open-inline pattern, never a popup or native `<select>`.
  Category lists scroll horizontally rather than wrapping.
- Rankings page with category filter tabs and gold/silver/bronze tier
  styling for the top 3
- Product pages with a rating/record/win-rate/rank stat block and a
  battle history list showing WON/LOST/TIE/LIVE per matchup
- Battle pages (`/battle/[slug]`) and product profile pages
  (`/product/[slug]`)
- Full rankings page (`/rankings`)
- Responsive layout — no fixed mobile-only width, scales up with `md:`
  breakpoints

## Known simplifications (documented in code comments)

- Voter dedup is IP-based only (`pages/api/vote.js`) — not real fraud
  prevention yet, just enough for the MVP
- Rating updates per-vote with a small K-factor rather than batching once
  when a battle completes — see the comment at the top of `elo.js`
- The rematch cooldown and rating-gap matchmaking check happen at
  battle-*creation* time only — they don't affect an already-live battle
- Battle expiry is lazy (checked on read, not via a scheduled job), so a
  battle can sit "live" in the database for a little while after its
  `ends_at` has technically passed, until the next time someone loads
  the homepage or that battle's page
- No review queue on submissions — anything submitted goes live
  immediately, spam/abuse handling is not built
- Auto-fetched logos/descriptions depend on the target site actually
  having Open Graph tags and not blocking the fetch — sites that block
  bot user agents, have no OG data, or time out will fail auto-fetch
  gracefully (falling back to a letter avatar / requiring a manual
  description), not error out
- The "vs" input parser only recognizes the literal word " vs " (or
  "vs.") between the two terms — there's no natural-language fallback if
  someone phrases it differently
- Category auto-suggestion (inferring a category from the site's content)
  was scoped out — category is still a manual required pick from the
  chip list. Nothing in this codebase calls an LLM to do that inference.
- Fuzzy search (`search_products()`, using `pg_trgm`) is meaningfully
  better than plain substring matching but isn't a full search engine —
  no typo tolerance tuning, no synonym dictionary beyond the manually
  filled `aliases` column, which has no UI yet
- Website-click tracking has a `clicks` column reserved for it, but no
  redirect endpoint or UI increments it yet — it will always read 0
  until that's built

## Deliberately not built yet

Auth, product claiming, payments, badges, tournaments, an API.

## Recent changes (branding + hardening pass)

- **Branding**: colors (`tailwind.config.js` → `cornerA` / `cornerB`) now
  match the Zoloop logo exactly (`#FE4C12` orange, `#754BF6` purple,
  sampled directly from the logo file). The header/favicon now use
  `public/logo.png` (the real Zoloop mark) instead of the old placeholder
  SVG.
- **Categories**: `supabase-seed.sql` now seeds the full 25-category list
  (Books, Business, Developer Tools, … Weather). The category filter
  moved from mid-page to the top of the homepage, right under the header,
  and is a row of tappable pills — never a native `<select>`/popup. The
  "Add a product" form's category picker was changed from a `<select>`
  to the same pill style for the same reason.
- **Demo competitors removed**: `supabase-seed.sql` no longer seeds any
  demo products or battles (previously included Claude vs ChatGPT,
  Cursor vs Windsurf, etc.). It now seeds categories only — real
  products/battles come from the submission form or manual inserts.
- **Responsive design**: removed the hard `max-width: 480px` cap in
  `styles.css` that forced a mobile-only layout regardless of screen
  size. Layouts now scale through `sm:`/`md:`/`lg:` breakpoints
  throughout, and `pages/rankings.js` was moved from a stray root-level
  `rankings.js` (which meant `/rankings` 404'd) into `pages/` where
  Next.js's router actually picks it up.
- **Error handling + logging**: added `lib/logger.js`, a small structured
  logger (`logError` / `logWarn` / `logInfo`) that prints one JSON line
  per event with a timestamp, the calling context, and the full error
  message/stack. Every `getServerSideProps`, API route, and interactive
  client function (voting, submitting a product, uploading a logo,
  navigating categories) is now wrapped in try/catch and logs through it,
  so the cause of any failure is visible in your terminal (`npm run dev`)
  or your hosting provider's function logs (e.g. Vercel → Deployments →
  Functions). A top-level React error boundary in `pages/_app.js` also
  catches any render-time crash, logs it, and shows a plain fallback
  instead of a blank white screen.

## Recent changes (battle lifecycle + rating overhaul)

- **Rating system replaced**: was Elo (dynamic K-factor math), now a flat
  ±64-per-result system starting at 1000 for new products, floored at 0.
  `elo.js` keeps its filename to avoid touching every import site, but
  its content is now flat-delta scoring — see the comment at the top of
  that file. **Existing products keep their current rating** — the 1000
  starting point only applies to products created from now on.
- **Matchmaking gate**: added a 200-point rating-gap cap. Two products
  more than 200 points apart can't battle — checked server-side in
  `pages/api/vote.js` at creation time, not adjustable from the client.
- **Rematch cooldown**: a pairing can't refight immediately — blocked if
  they already have a live battle or fought within the last 24h, checked
  in both directions (A-vs-B and B-vs-A count as the same pairing).
- **Battle duration is now required**: 1 hour / 24 hours / 7 days, picked
  from a fixed list before "Start Battle" unlocks — never a client-sent
  timestamp. Stored as `starts_at`/`ends_at` (columns already existed in
  the schema, just unused before). Expiry is lazy: the next time the
  homepage or that battle's page is loaded after `ends_at` passes, it
  flips from `live` to `completed` with a winner set from whichever side
  had more votes (or no winner if tied).
- **Views tracking**: `battles.views` is a new column (migration at the
  bottom of `supabase-schema.sql` — re-run that file once, it's
  idempotent). Increments on every `/battle/[slug]` page load, shown next
  to the vote count on the battle card, trending list, and product battle
  history.
- **"Your product" language removed**: this app has no accounts, so
  nothing is actually owned by anyone — the battle-creation flow now
  says "Product A" / "Product B" instead of "your product", and either
  slot can be filled first. Recommended-opponent suggestions now key off
  whichever slot gets filled first, not a fixed "yours" side.
- **RED CORNER / BLUE CORNER labels removed** from the battle card.
- **Category lists now scroll horizontally** instead of wrapping into
  multiple rows — both the homepage's Categories tab and the "Add a
  product" form's category picker.
- **Rankings page**: added category filter tabs (same horizontal-scroll
  pills as the homepage) and gold/silver/bronze tier styling for the top
  3 spots. `LeaderboardTable.js` rows are now bordered cards instead of a
  plain divided list, and show the product's category icon.
- **Product pages**: bigger hero block, a "Visit ↗" pill button instead
  of a plain text link for the website URL (also added to battle pages),
  a new RANK stat (computed from how many active products currently sit
  above this one), and a battle history list with WON/LOST/TIE/LIVE
  badges per matchup instead of a plain status label.
- **Logo/website rendering fix**: `LeaderboardTable.js`, `BattleCard.js`,
  and `pages/product/[slug].js` previously always showed a letter avatar
  and never rendered the uploaded logo or linked the website — fixed
  everywhere logos/links appear.
- **PNG-only, 2MB logo validation**: matches the actual Supabase
  Storage bucket restrictions (previously accepted any image type up to
  1MB, mismatched against the bucket's real limits and causing confusing
  upload failures).

One pre-existing gap this pass did **not** fix: this README references
`supabase-migration-description-limit.sql` and `supabase-rls.sql` in the
setup steps, but neither file exists in the repo. You'll need to write
those (or skip the description length DB constraint / apply RLS manually
via the Supabase dashboard) before following step 2 above.

## Recent changes (single-input flow + Elo revert)

- **Rating system reverted to dynamic Elo.** A brief flat ±64-per-result
  system shipped in the previous pass; this pass reverted it back to
  proper Elo (`elo.js`), because a later product decision called for
  upset wins to matter more than expected ones. The 1000 starting
  rating, 0 floor, and 200-point matchmaking gate are all unchanged —
  only the per-vote math changed back.
- **Category list replaced.** The old 25-category consumer-app list
  (Books, Magazines & Newspapers, Medical, Navigation, Sports, Weather,
  etc.) is gone, replaced with a 22-category founder/competitor-focused
  list (AI, Productivity, Developer Tools, Design, Note-taking,
  Collaboration, SaaS, Marketing, Finance, Business, E-commerce, and
  more — see `supabase-seed.sql` for the full list). Old categories are
  deleted on re-seed **only if no product still references them**, so
  this can never orphan an existing product or violate a foreign key.
- **Battles now carry a `question`** (e.g. "Which is better for
  launching a product?"), separate from either product's own
  description. This is what lets the same two products run multiple
  simultaneous battles under different questions — the rematch cooldown
  is now scoped to (pairing + question), not just pairing.
- **Fuzzy, typo-tolerant search added** via Postgres's `pg_trgm`
  extension and a new `search_products()` SQL function (see
  `supabase-schema.sql`'s second migration block) — ranks results by
  string similarity instead of requiring an exact substring match, and
  also checks a new (currently UI-less) `aliases` column for exact
  alias matches.
- **Product creation drastically simplified.** Previously name, website,
  category, description, AND a PNG logo were all required up front. Now
  only name, website, and category are required — description and logo
  are optional and auto-fetched server-side from the site's Open Graph
  tags if left blank (logo converted to PNG via the new `sharp`
  dependency), with any manually provided value always taking priority
  over the auto-fetched one.
- **Homepage flow collapsed into one input.** The old two-box "Product
  A" / "Product B" search flow is gone, replaced with a single
  `yourproduct.com vs competitor.com` field that parses on " vs " and
  searches both sides at once. The "Start a Battle" tab is now labeled
  "⚔️ Challenge a competitor", and the final button is "Create Battle"
  instead of "Start Battle". The old standalone "🔥 Recommended
  opponents" chip feature (suggesting an opponent by category once one
  side was picked) was removed in favor of this faster typed-input path
  — it may be worth re-adding later as a fallback for people who don't
  know who to challenge, but it isn't there right now.
- **`pages/api/submit-product.js`'s `GET ?q=` search** now calls the new
  `search_products()` Postgres function via `.rpc()` instead of a plain
  `ilike` query, and reshapes the flat function result back into the
  same `{ category: { name, icon } }` nested shape the UI already
  expected, to minimize changes elsewhere.
- **`package.json`**: added `sharp` as a real dependency (previously only
  available in the assistant's own sandbox) — required for the
  auto-fetched-logo-to-PNG conversion. Run `npm install` again after
  pulling this change.

### Explicitly scoped out of this pass (from the same source doc)

These were called out in the flow-redesign document this pass was based
on, but intentionally left for later rather than bundled in:

- Claiming/ownership (X login or magic-link auth) — no accounts exist in
  this app yet at all
- Website-click tracking — the `clicks` column exists, nothing writes to
  it
- Battle page actions beyond voting (share, visit, challenge-another,
  browse-related) and the post-vote result panel
- Shareable result-card images (would need real image generation, e.g.
  `@vercel/og` — the single biggest remaining piece)
- Homepage hero copy split for voters vs. founders, and the
  `?product=...&vs=...` instant-battle URL pattern
- Category auto-suggestion from site content (would need an LLM call;
  none is wired into this codebase)

### A note on what I could and couldn't verify myself

The auto-fetch-metadata and logo-conversion code
(`pages/api/submit-product.js`'s `fetchMetadata` / `fetchAndConvertLogo`)
was written carefully but **could not be tested end-to-end** in the
environment this was built in, which has no outbound network access. The
logic is sound and defensively written (timeouts, try/catch around every
fetch, graceful fallback on any failure), but real websites are messy —
expect to find and fix edge cases (unusual OG tag formats, sites that
block the request outright, redirects, etc.) once this runs against real
traffic on Vercel.
