# ZOLOOP

The internet picks the winner. Head-to-head product battles, voted on by
real people, ranked by ELO rating.

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

   - `supabase-schema.sql`
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
- Server-side voting (`pages/api/vote.js`) with per-battle dedup and ELO
  rating updates
- Product creation (`pages/api/submit-product.js`, `POST`) — name, website
  URL, category, a 280-character description, and a required PNG logo
  (≤2MB) uploaded to Supabase Storage. All five fields are required, both
  client-side and re-checked server-side. **Auto-publishes immediately**
  — no review queue.
- Product search + recommendations (`pages/api/submit-product.js`, `GET`)
  — `?q=text` for live search, `?category=id` for top-rated products in
  a category (used as "recommended opponents")
- Battle creation (`pages/api/vote.js`, `POST` with `action: "create"`) —
  takes two existing product ids, creates a `status: "live"` battle
  between them immediately, no approval step
- Homepage with a live battle, trending battles, and a leaderboard. A
  "Categories" tab and a "⚔️ Start a Battle" tab sit side by side at the
  top; each expands its panel inline (search-and-select or add-a-product,
  then start the battle) rather than opening a popup or native `<select>`
- Battle pages (`/battle/[slug]`) and product profile pages
  (`/product/[slug]`)
- Full rankings page (`/rankings`)
- Responsive layout — no fixed mobile-only width, scales up with `md:`
  breakpoints

## Known simplifications (documented in code comments)

- Voter dedup is IP-based only (`pages/api/vote.js`) — not real fraud
  prevention yet, just enough for the MVP
- ELO updates per-vote with a small k-factor rather than batching on
  battle completion
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

One pre-existing gap this pass did **not** fix: this README references
`supabase-migration-description-limit.sql` and `supabase-rls.sql` in the
setup steps, but neither file exists in the repo. You'll need to write
those (or skip the description length DB constraint / apply RLS manually
via the Supabase dashboard) before following step 2 above.
