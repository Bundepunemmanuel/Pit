-- PIT — seed data
-- Run after supabase-schema.sql

insert into categories (name, slug, icon) values
  ('AI', 'ai', '🤖'),
  ('Developer Tools', 'dev-tools', '💻'),
  ('Design', 'design', '🎨'),
  ('Marketing', 'marketing', '📣'),
  ('Productivity', 'productivity', '⚡'),
  ('SaaS', 'saas', '🚀');

-- Products (ratings deliberately varied so the leaderboard looks alive)
insert into products (name, slug, description, website_url, category_id, rating, wins, losses, status)
select 'Claude', 'claude', 'AI assistant for chat, writing, and code.', 'https://claude.ai',
  (select id from categories where slug = 'ai'), 1892, 42, 7, 'active'
union all
select 'ChatGPT', 'chatgpt', 'AI assistant from OpenAI.', 'https://chatgpt.com',
  (select id from categories where slug = 'ai'), 1875, 38, 9, 'active'
union all
select 'Cursor', 'cursor', 'The AI code editor.', 'https://cursor.com',
  (select id from categories where slug = 'dev-tools'), 1842, 31, 8, 'active'
union all
select 'Windsurf', 'windsurf', 'Agentic IDE.', 'https://windsurf.com',
  (select id from categories where slug = 'dev-tools'), 1724, 26, 12, 'active'
union all
select 'Figma', 'figma', 'Collaborative interface design.', 'https://figma.com',
  (select id from categories where slug = 'design'), 1811, 29, 11, 'active'
union all
select 'Canva', 'canva', 'Design for everyone.', 'https://canva.com',
  (select id from categories where slug = 'design'), 1689, 22, 11, 'active'
union all
select 'Notion', 'notion', 'Docs, wikis, and projects together.', 'https://notion.so',
  (select id from categories where slug = 'productivity'), 1798, 34, 15, 'active'
union all
select 'Obsidian', 'obsidian', 'A knowledge base that works on local files.', 'https://obsidian.md',
  (select id from categories where slug = 'productivity'), 1650, 20, 14, 'active'
union all
select 'Vercel', 'vercel', 'Develop, preview, ship.', 'https://vercel.com',
  (select id from categories where slug = 'dev-tools'), 1753, 27, 10, 'active'
union all
select 'Netlify', 'netlify', 'Deploy web projects instantly.', 'https://netlify.com',
  (select id from categories where slug = 'dev-tools'), 1611, 18, 13, 'active';

-- Battles: a mix of live and completed so the homepage has content
insert into battles (slug, product_a_id, product_b_id, status, votes_a, votes_b, starts_at, ends_at)
select 'claude-vs-chatgpt',
  (select id from products where slug = 'claude'),
  (select id from products where slug = 'chatgpt'),
  'live', 12842, 10921, now(), now() + interval '1 day'
union all
select 'cursor-vs-windsurf',
  (select id from products where slug = 'cursor'),
  (select id from products where slug = 'windsurf'),
  'live', 8421, 4950, now(), now() + interval '2 days'
union all
select 'notion-vs-obsidian',
  (select id from products where slug = 'notion'),
  (select id from products where slug = 'obsidian'),
  'live', 1977, 2844, now(), now() + interval '1 day'
union all
select 'figma-vs-canva',
  (select id from products where slug = 'figma'),
  (select id from products where slug = 'canva'),
  'live', 3707, 2685, now(), now() + interval '3 days'
union all
select 'vercel-vs-netlify',
  (select id from products where slug = 'vercel'),
  (select id from products where slug = 'netlify'),
  'live', 3468, 1709, now(), now() + interval '2 days';
