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
