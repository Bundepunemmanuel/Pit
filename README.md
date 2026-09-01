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

2. In the Supabase SQL editor, run in this order:

   - `supabase-schema.sql` — includes a migration block at the bottom
     (`views` column on battles, new-product rating default of 1000, and
     a rating-floor constraint). **Safe to re-run** even if you already
     ran an earlier version of this file — every statement in the
     migration block is idempotent.
   - `supabase-migration-description-limit.sql`
   - `supabase-seed.sql`
   - Enable Row Level Security on `products`, `categories`, `battles`,
     `votes` (Table Editor → each table → RLS toggle), then run
     `supabase-rls.sql`

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
- **Rating system** (`elo.js` — filename kept for import stability, but
  this is no longer Elo): new products start at 1000. A win is worth flat
  +64, a loss is flat −64, floored at 0 — same delta regardless of the
  opponent's rating. Existing products from before this system shipped
  keep whatever rating they already had.
- **Matchmaking gate**: two products can only battle if their ratings are
  within 200 points of each other (`isMatchAllowed` in `elo.js`),
  enforced server-side in `pages/api/vote.js` at battle-creation time.
- **Rematch cooldown**: the same pairing (in either order) can't create a
  new battle while one between them is still live, or if they fought
  within the last 24h.
- **Battle duration**: required at creation — 1 hour, 24 hours, or 7
  days, chosen from a fixed whitelist server-side (never a client-sent
  timestamp). `starts_at`/`ends_at` are stored and shown on the battle
  card. Once `ends_at` passes, the battle is lazily flipped from `live`
  to `completed` (with a winner set from whichever side had more votes,
  or no winner if tied) the next time anyone loads it — no cron job.
- **Views**: every `/battle/[slug]` page load increments that battle's
  `views` counter, shown alongside its vote count.
- Server-side voting (`pages/api/vote.js`) with 1-vote-per-IP-per-battle
  dedup and rating updates on every vote
- Product creation (`pages/api/submit-product.js`, `POST`) — name, website
  URL, category, a 280-character description, and a required PNG logo
  (≤2MB) uploaded to Supabase Storage. All five fields are required, both
  client-side and re-checked server-side. **Auto-publishes immediately**
  — no review queue.
- Product search + recommendations (`pages/api/submit-product.js`, `GET`)
  — `?q=text` for live search, `?category=id` for top-rated products in
  a category (used as "recommended opponents"). Either battle slot can be
  filled first — there's no "your product" concept since this app has no
  accounts, so nothing is actually owned by anyone.
- Battle creation (`pages/api/vote.js`, `POST` with `action: "create"`) —
  takes two existing product ids and a required duration, creates a
  `status: "live"` battle between them immediately, no approval step
- Homepage with a live battle, trending battles, and a leaderboard. A
  "Categories" tab and a "⚔️ Start a Battle" tab sit side by side at the
  top; each expands its panel inline (search-and-select or add-a-product,
  then start the battle) rather than opening a popup or native `<select>`.
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
- Rating movement is a flat ±64 per result, not a dynamic system that
  weighs the opponent's strength — simpler to reason about, but doesn't
  reward upset wins more than expected ones
- The rematch cooldown and rating-gap matchmaking check happen at
  battle-*creation* time only — they don't affect an already-live battle
- Battle expiry is lazy (checked on read, not via a scheduled job), so a
  battle can sit "live" in the database for a little while after its
  `ends_at` has technically passed, until the next time someone loads
  the homepage or that battle's page
- No review queue on submissions — anything submitted goes live
  immediately, spam/abuse handling is not built

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
