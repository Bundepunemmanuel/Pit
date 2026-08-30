import Link from "next/link";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between border-b border-line bg-ink/90 px-4 py-3 backdrop-blur">
      <Link href="/" className="flex items-center gap-2">
        <img src="/logo.svg" alt="" className="h-6 w-6" />
        <span className="font-display text-lg uppercase tracking-wide">
          Zoloop
        </span>
      </Link>

      <nav className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-wide text-grayText">
        <Link href="/">Battles</Link>
        <Link href="/rankings">Rankings</Link>
      </nav>
    </header>
  );
}
