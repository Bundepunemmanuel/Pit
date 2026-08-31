import Link from "next/link";
import { logError } from "./lib/logger";

// products shape: [{ id, slug, name, rating, wins, losses }]
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
    <div className="md:grid md:grid-cols-2 md:gap-x-10 lg:grid-cols-3">
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

        return (
          <Link
            key={p.id}
            href={`/product/${p.slug}`}
            className="flex items-center gap-3 border-b border-line py-3 last:border-none"
          >
            <div
              className={`w-5 font-mono text-sm ${
                rank === 1 ? "font-bold text-gold" : "text-grayText"
              }`}
            >
              {rank}
            </div>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-white font-display text-xs">
              {p.logo_url ? (
                <img src={p.logo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                p.name[0]
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">{p.name}</div>
              <div className="font-mono text-[11px] text-grayText">
                {p.wins ?? 0}W – {p.losses ?? 0}L · {winRate}% win rate
              </div>
            </div>
            <div className="text-right font-mono text-sm font-bold">
              {p.rating ?? "—"}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
