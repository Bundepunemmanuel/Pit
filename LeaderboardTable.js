import Link from "next/link";
import { logError } from "./lib/logger";

// Tier styling for the top 3 spots — gold / silver / bronze. Arbitrary
// hex values via Tailwind's bracket syntax work without touching the
// theme config, since these are one-off accents specific to this table.
const TIERS = {
  1: { bg: "bg-gold", text: "text-ink", ring: "ring-gold" },
  2: { bg: "bg-[#C7C9D1]", text: "text-ink", ring: "ring-[#C7C9D1]" },
  3: { bg: "bg-[#C68A4E]", text: "text-white", ring: "ring-[#C68A4E]" },
};

// products shape: [{ id, slug, name, rating, wins, losses, logo_url, category }]
export default function LeaderboardTable({ products }) {
  if (!Array.isArray(products)) {
    logError(
      "LeaderboardTable.render",
      new Error("products prop was not an array"),
      { products }
    );
    return (
      <p className="py-6 font-mono text-xs text-grayText">
        Couldn't load the leaderboard.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3 lg:grid-cols-3">
      {products.map((p, i) => {
        if (!p || !p.id || !p.name) {
          logError(
            "LeaderboardTable.render",
            new Error("Malformed product row"),
            { product: p, index: i }
          );
          return null;
        }

        const rank = i + 1;
        const total = (p.wins ?? 0) + (p.losses ?? 0);
        const winRate = total > 0 ? Math.round((p.wins / total) * 100) : 0;
        const tier = TIERS[rank];

        return (
          <Link
            key={p.id}
            href={`/product/${p.slug}`}
            className={`flex items-center gap-3 rounded-xl border bg-white px-3 py-3 transition-colors hover:border-cornerA ${
              tier ? `border-line ring-1 ${tier.ring}` : "border-line"
            }`}
          >
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold ${
                tier ? `${tier.bg} ${tier.text}` : "bg-paper text-grayText"
              }`}
            >
              {rank}
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-paper font-display text-sm">
              {p.logo_url ? (
                <img src={p.logo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                p.name[0]
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{p.name}</div>
              <div className="font-mono text-[11px] text-grayText">
                {p.category?.icon ? `${p.category.icon} ` : ""}
                {p.wins ?? 0}W – {p.losses ?? 0}L · {winRate}% win rate
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-mono text-sm font-bold">{p.rating ?? "—"}</div>
              <div className="font-mono text-[9px] uppercase text-grayText">rating</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
