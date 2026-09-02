-- Zoloop — seed data
-- Run after supabase-schema.sql. Safe to re-run any number of times —
-- category inserts use ON CONFLICT so re-running never fails with a
-- duplicate-key error, it just re-syncs name/icon for existing slugs.
--
-- NOTE: This seed file intentionally contains ONLY categories.
-- Earlier versions of this seed shipped demo battles between real
-- competitor products (Claude vs ChatGPT, Cursor vs Windsurf, etc.) —
-- those have been removed on purpose. Products and battles are now
-- expected to come in through the battle-creation flow on the homepage,
-- seeded by real users of the platform.

insert into categories (name, slug, icon) values
  ('AI', 'ai', '🤖'),
  ('Productivity', 'productivity', '⚡'),
  ('Developer Tools', 'developer-tools', '💻'),
  ('Design', 'design', '🎨'),
  ('Note-taking', 'note-taking', '📝'),
  ('Collaboration', 'collaboration', '🤝'),
  ('SaaS', 'saas', '☁️'),
  ('Marketing', 'marketing', '📣'),
  ('Finance', 'finance', '💰'),
  ('Business', 'business', '💼'),
  ('E-commerce', 'e-commerce', '🛒'),
  ('Photo & Video', 'photo-video', '📸'),
  ('Music', 'music', '🎵'),
  ('Entertainment', 'entertainment', '🎬'),
  ('Games', 'games', '🎮'),
  ('Health & Fitness', 'health-fitness', '💪'),
  ('Education', 'education', '🎓'),
  ('Travel', 'travel', '✈️'),
  ('Shopping', 'shopping', '🛍️'),
  ('Social', 'social', '👥'),
  ('Utilities', 'utilities', '🛠️'),
  ('News', 'news', '📰')
on conflict (slug) do update
  set name = excluded.name,
      icon = excluded.icon;

-- Replaces the old 25-category consumer-app list (Books, Magazines &
-- Newspapers, Medical, Navigation, Sports, Weather, etc.) with the
-- founder/competitor-focused list above. Old categories are removed —
-- but ONLY if nothing still references them, so this can never break a
-- foreign key or silently orphan an existing product. If you still have
-- products tagged with an old category, that category (and only that
-- one) will stick around until you recategorize those products.
delete from categories
where slug not in (
  'ai','productivity','developer-tools','design','note-taking',
  'collaboration','saas','marketing','finance','business','e-commerce',
  'photo-video','music','entertainment','games','health-fitness',
  'education','travel','shopping','social','utilities','news'
)
and id not in (
  select category_id from products where category_id is not null
);
