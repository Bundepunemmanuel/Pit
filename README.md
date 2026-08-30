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
   **Storage → New bucket**, name it `logos`, and mark it **public**.
   That's what product logo uploads write to.

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
- Product submission (`pages/api/submit-product.js`) — name, URL/@handle,
  category, a 280-character description (enforced client-side, API-side,
  and with a database constraint), and an optional logo upload (≤1MB) to
  Supabase Storage. **Auto-publishes immediately** — no review queue.
- Homepage with a live battle, trending battles, a category filter, and
  a leaderboard, plus the submit form
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
