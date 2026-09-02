import Link from "next/link";
import { useState } from "react";
import { logError } from "./lib/logger";

// Categories and Challenge a competitor live in this persistent header
// now (previously they were homepage-only toggle tabs). Both are plain
// links to "/" with a `panel` query param — pages/index.js reads that
// param to auto-open the right inline panel. Still never a popup/modal:
// clicking either just navigates to (or, if already on) the homepage
// and expands a section of the page, same as before.
export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  function toggleMenu() {
    try {
      setMenuOpen((open) => !open);
    } catch (err) {
      logError("Header.toggleMenu", err);
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper/90 backdrop-blur">
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
        <nav className="hidden items-center gap-6 font-mono text-[11px] uppercase tracking-wide text-grayText md:flex">
          <Link href="/" className="hover:text-ink">
            Battles
          </Link>
          <Link href="/rankings" className="hover:text-ink">
            Rankings
          </Link>
          <Link href="/?panel=categories" className="hover:text-ink">
            Categories
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
          className="flex h-8 w-8 flex-col items-center justify-center gap-1 md:hidden"
        >
          <span className="h-0.5 w-5 bg-ink" />
          <span className="h-0.5 w-5 bg-ink" />
        </button>
      </div>

      {menuOpen && (
        <nav className="flex flex-col border-t border-line px-4 py-2 font-mono text-xs uppercase tracking-wide text-grayText md:hidden">
          <Link href="/" className="border-b border-line py-3" onClick={() => setMenuOpen(false)}>
            Battles
          </Link>
          <Link
            href="/rankings"
            className="border-b border-line py-3"
            onClick={() => setMenuOpen(false)}
          >
            Rankings
          </Link>
          <Link
            href="/?panel=categories"
            className="border-b border-line py-3"
            onClick={() => setMenuOpen(false)}
          >
            Categories
          </Link>
          <Link href="/?panel=battle" className="py-3 font-bold text-ink" onClick={() => setMenuOpen(false)}>
            Challenge a competitor
          </Link>
        </nav>
      )}
    </header>
  );
}
