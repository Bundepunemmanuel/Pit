import Link from "next/link";

// products shape: [{ id, slug, name, rating, wins, losses }]
export default function LeaderboardTable({ products }) {
  return (
    <div>
      {products.map((p, i) => {
        const rank = i + 1;
        const total = p.wins + p.losses;
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
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-inkCard font-display text-xs">
              {p.name[0]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">{p.name}</div>
              <div className="font-mono text-[11px] text-grayText">
                {p.wins}W – {p.losses}L · {winRate}% win rate
              </div>
            </div>
            <div className="text-right font-mono text-sm font-bold">
              {p.rating}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
