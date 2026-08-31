import Link from "next/link";
import { useState } from "react";
import { logError } from "./lib/logger";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  function toggleMenu() {
    try {
      setMenuOpen((open) => !open);
    } catch (err) {
      // State setters essentially never throw, but keep the handler safe
      // and traceable rather than letting a stray error crash the header.
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
        <nav className="hidden items-center gap-6 font-mono text-[11px] uppercase tracking-wide text-grayText sm:flex">
          <Link href="/" className="hover:text-ink">
            Battles
          </Link>
          <Link href="/rankings" className="hover:text-ink">
            Rankings
          </Link>
        </nav>

        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={toggleMenu}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
          className="flex h-8 w-8 flex-col items-center justify-center gap-1 sm:hidden"
        >
          <span className="h-0.5 w-5 bg-ink" />
          <span className="h-0.5 w-5 bg-ink" />
        </button>
      </div>

      {menuOpen && (
        <nav className="flex flex-col border-t border-line px-4 py-2 font-mono text-xs uppercase tracking-wide text-grayText sm:hidden">
          <Link
            href="/"
            className="border-b border-line py-3"
            onClick={() => setMenuOpen(false)}
          >
            Battles
          </Link>
          <Link
            href="/rankings"
            className="py-3"
            onClick={() => setMenuOpen(false)}
          >
            Rankings
          </Link>
        </nav>
      )}
    </header>
  );
}
