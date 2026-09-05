import {
  Bot,
  Zap,
  Code,
  Palette,
  NotebookPen,
  Users,
  Cloud,
  Megaphone,
  DollarSign,
  Briefcase,
  ShoppingCart,
  Camera,
  Music,
  Film,
  Gamepad2,
  HeartPulse,
  GraduationCap,
  Plane,
  ShoppingBag,
  MessageCircle,
  Wrench,
  Newspaper,
  Tag,
} from "lucide-react";

// Maps each category slug (from supabase-seed.sql) to a real icon
// component instead of an emoji glyph — emoji rendering varies wildly
// across devices/OSes/browsers and looked inconsistent. `categories.icon`
// in the database still stores an emoji for now (harmless, just unused by
// the UI) — this mapping is the source of truth for what actually
// renders. Falls back to a generic tag icon for any slug not listed here
// (e.g. a category added later without updating this file).
export const CATEGORY_ICONS = {
  ai: Bot,
  productivity: Zap,
  "developer-tools": Code,
  design: Palette,
  "note-taking": NotebookPen,
  collaboration: Users,
  saas: Cloud,
  marketing: Megaphone,
  finance: DollarSign,
  business: Briefcase,
  "e-commerce": ShoppingCart,
  "photo-video": Camera,
  music: Music,
  entertainment: Film,
  games: Gamepad2,
  "health-fitness": HeartPulse,
  education: GraduationCap,
  travel: Plane,
  shopping: ShoppingBag,
  social: MessageCircle,
  utilities: Wrench,
  news: Newspaper,
};

/**
 * Renders the icon for a category slug, sized/colored via className like
 * any other lucide-react icon (e.g. className="h-4 w-4").
 */
export function CategoryIcon({ slug, className }) {
  const Icon = CATEGORY_ICONS[slug] || Tag;
  return <Icon className={className} strokeWidth={2} />;
}

// Fallback letter-avatar tints, keyed by PRODUCT IDENTITY (name) rather
// than by which side of a battle it happens to be on. Before this,
// every fallback avatar used a color tied to "side A" or "side B" (or
// just a flat gray), so the same product could show up orange in one
// battle and purple in another, and unrelated products on the same side
// all looked identical — Claude, ChatGPT, Cursor, and Canva were all a
// plain gray "C". Hashing the name into one of these tints means a
// given product always gets the same color everywhere on the site,
// making it recognizable even without a real logo image.
const AVATAR_TINTS = [
  { bg: "#FFF1EA", text: "#FE4C12" }, // cornerA tint
  { bg: "#F1ECFE", text: "#754BF6" }, // cornerB tint
  { bg: "#FBF3DF", text: "#8A6A16" }, // gold tint
  { bg: "#E2F5F4", text: "#0EA5A0" }, // teal
  { bg: "#E9F5EC", text: "#1F9D55" }, // green
  { bg: "#FCE7F3", text: "#BE185D" }, // rose
];

export function getAvatarTint(name) {
  const str = (name || "?").toLowerCase();
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}
