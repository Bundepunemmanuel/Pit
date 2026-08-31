-- Zoloop — seed data
-- Run after supabase-schema.sql
--
-- NOTE: This seed file intentionally contains ONLY categories.
-- Earlier versions of this seed shipped demo battles between real
-- competitor products (Claude vs ChatGPT, Cursor vs Windsurf, etc.) —
-- those have been removed on purpose. Products and battles are now
-- expected to come in through the "Add it" submission form on the
-- homepage, seeded by real users of the platform.

insert into categories (name, slug, icon) values
  ('Books', 'books', '📚'),
  ('Business', 'business', '💼'),
  ('Developer Tools', 'developer-tools', '💻'),
  ('Education', 'education', '🎓'),
  ('Entertainment', 'entertainment', '🎬'),
  ('Finance', 'finance', '💰'),
  ('Food & Drink', 'food-drink', '🍔'),
  ('Games', 'games', '🎮'),
  ('Graphics & Design', 'graphics-design', '🎨'),
  ('Health & Fitness', 'health-fitness', '💪'),
  ('Lifestyle', 'lifestyle', '🌿'),
  ('Magazines & Newspapers', 'magazines-newspapers', '🗞️'),
  ('Medical', 'medical', '🏥'),
  ('Music', 'music', '🎵'),
  ('Navigation', 'navigation', '🧭'),
  ('News', 'news', '📰'),
  ('Photo & Video', 'photo-video', '📸'),
  ('Productivity', 'productivity', '⚡'),
  ('Reference', 'reference', '📖'),
  ('Shopping', 'shopping', '🛍️'),
  ('Social Networking', 'social-networking', '👥'),
  ('Sports', 'sports', '🏆'),
  ('Travel', 'travel', '✈️'),
  ('Utilities', 'utilities', '🛠️'),
  ('Weather', 'weather', '☀️');

-- No demo products or battles are seeded. Add real ones via the
-- "Built something? Add it." form on the homepage, or insert rows into
-- `products` / `battles` directly if you're bootstrapping content.
