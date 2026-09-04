import Link from "next/link";
import { supabase } from "../supabase";
import { CategoryIcon } from "../lib/categoryIcons";
import { logError } from "../lib/logger";

const PAGE_SIZE = 30;

export async function getServerSideProps({ query }) {
  const status = query?.status === "completed" ? "completed" : "live";
  try {
    const { data: battles, error } = await supabase
      .from("battles")
      .select(
        "id, slug, votes_a, votes_b, votes_a_boost, votes_b_boost, status, question, clicks, created_by, created_at, product_a:product_a_id(id, name, logo_url, category:category_id(name, slug)), product_b:product_b_id(id, name, logo_url)"
      )
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (error) {
      logError("pages/battles.getServerSideProps", error, { status });
      return { props: { battles: [], status, loadError: "Couldn't load battles right now." } };
    }

    const boosted = (battles ?? []).map((b) => ({
      ...b,
      votes_a: (b.votes_a ?? 0) + (b.votes_a_boost ?? 0),
      votes_b: (b.votes_b ?? 0) + (b.votes_b_boost ?? 0),
    }));

    // Highest total votes first — "all battles" defaults to showing the
    // most active ones up top, same spirit as Happening Now on the
    // homepage, just without the uniqueness constraint (this is the
    // full list, not a curated preview row).
    boosted.sort((a, b) => b.votes_a + b.votes_b - (a.votes_a + a.votes_b));

    return { props: { battles: boosted, status, loadError: null } };
  } catch (err) {
    logError("pages/battles.getServerSideProps", err, { status });
    return { props: { battles: [], status, loadError: "Couldn't load battles right now." } };
  }
}

export default function AllBattles({ battles, status, loadError }) {
  return (
    <div className="mx-auto max-w-5xl px-5 pb-16 pt-8 md:px-8">
      <h1 className="font-display text-2xl uppercase tracking-wide">All battles</h1>
      <p className="mt-1 font-mono text-xs text-grayText">
        Every product battle on Zoloop, ranked by total votes.
      </p>

      <div className="mt-4 flex gap-2">
        <Link
          href="/battles?status=live"
          className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
            status === "live"
              ? "border-cornerA bg-cornerA text-white"
              : "border-line bg-white text-ink"
          }`}
        >
          Live
        </Link>
        <Link
          href="/battles?status=completed"
          className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
            status === "completed"
              ? "border-cornerA bg-cornerA text-white"
              : "border-line bg-white text-ink"
          }`}
        >
          Completed
        </Link>
      </div>

      {loadError && (
        <div className="mt-4 rounded-lg border border-cornerA bg-cornerADim px-4 py-3 font-mono text-xs text-paper">
          {loadError}
        </div>
      )}

      {!loadError && battles.length === 0 && (
        <p className="mt-8 text-center font-mono text-sm text-grayText">
          No {status} battles right now.
        </p>
      )}

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {battles.map((b) => {
          const total = b.votes_a + b.votes_b;
          const pctA = total > 0 ? Math.round((b.votes_a / total) * 100) : 50;
          const category = b.product_a?.category || null;
          const clicks = typeof b.clicks === "number" ? b.clicks : 0;
          return (
            <Link
              key={b.id}
              href={`/battle/${b.slug}`}
              className="rounded-xl border border-line bg-white p-3 hover:border-cornerA"
            >
              <div className="flex items-center justify-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-paper font-display text-xs">
                  {b.product_a.logo_url ? (
                    <img
                      src={b.product_a.logo_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    b.product_a.name[0]
                  )}
                </div>
                <span className="font-mono text-[10px] text-grayText">
                  {pctA}% / {100 - pctA}%
                </span>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-paper font-display text-xs">
                  {b.product_b.logo_url ? (
                    <img
                      src={b.product_b.logo_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    b.product_b.name[0]
                  )}
                </div>
              </div>

              <div className="mt-2 text-center text-xs font-bold text-ink">
                {b.product_a.name} <span className="font-normal text-grayText">vs</span>{" "}
                {b.product_b.name}
              </div>

              {b.question && (
                <div className="mt-1 line-clamp-2 text-center text-[11px] leading-snug text-grayText">
                  {b.question}
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 font-mono text-[10px] text-grayText">
                {category?.slug && (
                  <span className="flex items-center gap-1">
                    <CategoryIcon slug={category.slug} className="h-3 w-3 shrink-0" />
                    {category.name}
                  </span>
                )}
                {b.created_by === "admin" && (
                  <span className="font-bold text-cornerA">ZOLOOP PICK</span>
                )}
                {status === "live" && (
                  <span className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-cornerA" />
                    LIVE
                  </span>
                )}
                <span>
                  {total.toLocaleString()} {total === 1 ? "vote" : "votes"}
                </span>
                <span>
                  {clicks.toLocaleString()} {clicks === 1 ? "click" : "clicks"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
