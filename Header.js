import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { Home, Swords, Trophy, Menu, X } from "lucide-react";
import { logError } from "./lib/logger";

// Challenge a competitor lives in this persistent header now (previously
// it was a homepage-only toggle tab). It's a plain link to "/" with a
// `panel` query param — pages/index.js reads that param to auto-open the
// inline panel. Still never a popup/modal: clicking it just navigates to
// (or, if already on) the homepage and expands a section of the page.
// Categories used to live here too as a homepage panel link — it's now
// a permanent scrollable pill row on /battles instead (see pages/battles.js),
// since filtering by category is really a Battles-page concern, not a
// site-wide nav destination.
export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();

  function toggleMenu() {
    try {
      setMenuOpen((open) => !open);
    } catch (err) {
      logError("Header.toggleMenu", err);
    }
  }

  const isHome = router.pathname === "/";
  const isBattles = router.pathname === "/battles";
  const isRankings = router.pathname === "/rankings";

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-8">
        <Link href="/" className="flex items-center gap-2" onClick={() => setMenuOpen(false)}>
          <img
            src="/logo.png"
            alt="Zoloop"
            className="h-7 w-7 rounded-md object-cover md:h-8 md:w-8"
          />
          <span className="font-display text-lg uppercase tracking-wide md:text-xl">
            Zoloop
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 font-mono text-[11px] uppercase tracking-wide md:flex">
          <Link
            href="/"
            className={`flex items-center gap-1.5 transition-colors ${
              isHome ? "font-bold text-ink" : "text-grayText hover:text-ink"
            }`}
          >
            <Home className="h-3.5 w-3.5" strokeWidth={2} />
            Home
          </Link>
          <Link
            href="/battles"
            className={`flex items-center gap-1.5 transition-colors ${
              isBattles ? "font-bold text-ink" : "text-grayText hover:text-ink"
            }`}
          >
            <Swords className="h-3.5 w-3.5" strokeWidth={2} />
            Battles
          </Link>
          <Link
            href="/rankings"
            className={`flex items-center gap-1.5 transition-colors ${
              isRankings ? "font-bold text-ink" : "text-grayText hover:text-ink"
            }`}
          >
            <Trophy className="h-3.5 w-3.5" strokeWidth={2} />
            Rankings
          </Link>
          <Link
            href="/?panel=battle"
            className="rounded-lg bg-ink px-4 py-2 text-white transition-opacity hover:opacity-90"
          >
            Challenge a competitor
          </Link>
        </nav>

        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={toggleMenu}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
          className="flex h-8 w-8 items-center justify-center text-ink md:hidden"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {menuOpen && (
        <nav className="flex flex-col border-t border-line px-4 py-2 font-mono text-xs uppercase tracking-wide md:hidden">
          <Link
            href="/"
            className={`flex items-center gap-2 border-b border-line py-3 ${
              isHome ? "font-bold text-ink" : "text-grayText"
            }`}
            onClick={() => setMenuOpen(false)}
          >
            <Home className="h-4 w-4" strokeWidth={2} />
            Home
          </Link>
          <Link
            href="/battles"
            className={`flex items-center gap-2 border-b border-line py-3 ${
              isBattles ? "font-bold text-ink" : "text-grayText"
            }`}
            onClick={() => setMenuOpen(false)}
          >
            <Swords className="h-4 w-4" strokeWidth={2} />
            Battles
          </Link>
          <Link
            href="/rankings"
            className={`flex items-center gap-2 border-b border-line py-3 ${
              isRankings ? "font-bold text-ink" : "text-grayText"
            }`}
            onClick={() => setMenuOpen(false)}
          >
            <Trophy className="h-4 w-4" strokeWidth={2} />
            Rankings
          </Link>
          <Link
            href="/?panel=battle"
            className="py-3 font-bold text-ink"
            onClick={() => setMenuOpen(false)}
          >
            Challenge a competitor
          </Link>
        </nav>
      )}
    </header>
  );
}
