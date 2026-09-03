import Link from "next/link";
import { CategoryIcon } from "./lib/categoryIcons";
import { logError } from "./lib/logger";

const TIERS = {
  1: { bg: "bg-gold", text: "text-ink", ring: "ring-gold" },
  2: { bg: "bg-[#C7C9D1]", text: "text-ink", ring: "ring-[#C7C9D1]" },
  3: { bg: "bg-[#C68A4E]", text: "text-white", ring: "ring-[#C68A4E]" },
};

// Confidence is a simple function of how many battles a rating is based
// on — not a statistical margin of error, just "how much to trust this
// number." Cutoffs are a judgment call, not derived from anything.
function getConfidence(battleCount) {
  if (battleCount >= 30) return { label: "High", dotClass: "bg-[#1F9D55]" };
  if (battleCount >= 10) return { label: "Medium", dotClass: "bg-gold" };
  return { label: "Low", dotClass: "bg-grayText" };
}

function renderForm(delta) {
  if (delta === null || delta === undefined || delta === 0) {
    return <span className="text-grayText">—</span>;
  }
  if (delta > 0) {
    return <span className="text-[#1F9D55]">↑{delta}</span>;
  }
  return <span className="text-cornerA">↓{Math.abs(delta)}</span>;
}

// products shape: [{ id, slug, name, rating, wins, losses, logo_url, category }]
// mode: "compact" (homepage — rank/product/record/win rate/rating) or
//       "full" (rankings page — adds confidence, battle count, form)
// form: optional map of productId -> signed rank change over ~24h (see
// pages/rankings.js for how this is computed — it's an approximation,
// not a precise time-series, documented there)
export default function LeaderboardTable({ products, mode = "compact", form = {} }) {
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
    <div className="flex flex-col gap-2">
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
        const battleCount = (p.wins ?? 0) + (p.losses ?? 0);
        const winRate = battleCount > 0 ? Math.round((p.wins / battleCount) * 100) : 0;
        const tier = TIERS[rank];
        const confidence = getConfidence(battleCount);

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
              <div className="flex items-center gap-1 font-mono text-[11px] text-grayText">
                {p.category?.slug && <CategoryIcon slug={p.category.slug} className="h-3 w-3 shrink-0" />}
                <span>
                  {p.wins ?? 0}W – {p.losses ?? 0}L · {winRate}% win rate
                  {mode === "full" && ` · ${battleCount} battles`}
                  {typeof p.clicks === "number" && ` · ${p.clicks.toLocaleString()} clicks`}
                </span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="flex items-center justify-end gap-1.5">
                {mode === "full" && (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${confidence.dotClass}`}
                    title={`${confidence.label} confidence`}
                  />
                )}
                <span className="font-mono text-sm font-bold">{p.rating ?? "—"}</span>
              </div>
              <div className="font-mono text-[9px] uppercase text-grayText">
                {mode === "full" ? confidence.label : "rating"}
              </div>
              {mode === "full" && (
                <div className="mt-0.5 font-mono text-[10px] font-bold">
                  {renderForm(form[p.id])}
                </div>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
