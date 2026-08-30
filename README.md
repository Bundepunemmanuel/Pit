# PIT

The internet picks the winner. Head-to-head product battles, voted on by
real people, ranked by ELO rating.

## Stack

- Next.js 15.3.6 (Pages Router)
- Tailwind CSS
- Supabase (Postgres)
- Deployed on Vercel

## Setup

1. Install dependencies:

   ```
   npm install
   ```

2. Create a Supabase project, then run the schema and seed data in the
   Supabase SQL editor, in this order:

   - `supabase-schema.sql`
   - `supabase-seed.sql`

3. Copy `.env.local.example` to `.env.local` and fill in your Supabase
   project URL and anon key (Supabase dashboard → Settings → API).

4. Run locally:

   ```
   npm run dev
   ```

5. Deploy: push to GitHub, import the repo in Vercel, add the same two
   environment variables in the Vercel project settings.

## What's here (MVP scope)

- `products`, `categories`, `battles`, `votes` — the four core tables
- Server-side voting (`pages/api/vote.js`) — vote counts and ELO ratings
  are never trusted from the client
- Homepage with a live battle, trending battles, and a leaderboard
- Individual battle pages (`/battle/[slug]`) and product profile pages
  (`/product/[slug]`)
- Full rankings page (`/rankings`)

## Deliberately not built yet

Auth, product claiming, payments, badges, tournaments, an API, and
serious anti-fraud (see the note in `pages/api/vote.js`) are all left
out on purpose. The schema is shaped so they can be layered on without
restructuring the core tables — see the original architecture notes for
what each of those would look like.
