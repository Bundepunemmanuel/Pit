-- PIT — MVP schema
-- Run this in the Supabase SQL editor before seeding.

create extension if not exists "pgcrypto";

-- ---------- categories ----------
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  icon text,
  created_at timestamptz not null default now()
);

-- ---------- products ----------
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  website_url text,
  logo_url text,
  category_id uuid references categories(id),
  twitter_handle text,
  rating integer not null default 1500,
  wins integer not null default 0,
  losses integer not null default 0,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_rating_idx on products (rating desc);
create index products_category_idx on products (category_id);

-- ---------- battles ----------
create table battles (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  product_a_id uuid not null references products(id),
  product_b_id uuid not null references products(id),
  status text not null default 'pending'
    check (status in ('pending', 'live', 'completed', 'cancelled')),
  votes_a integer not null default 0,
  votes_b integer not null default 0,
  winner_id uuid references products(id),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create index battles_status_idx on battles (status);

-- ---------- votes ----------
-- Every vote is logged individually — never just increment a counter.
-- This is what lets fraud detection / historical analytics exist later.
create table votes (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references battles(id),
  product_id uuid not null references products(id),
  voter_hash text not null,
  created_at timestamptz not null default now()
);

create index votes_battle_idx on votes (battle_id);
create index votes_voter_hash_idx on votes (voter_hash);

-- One vote per browser per battle (MVP-level fraud prevention).
create unique index votes_one_per_voter_per_battle
  on votes (battle_id, voter_hash);
