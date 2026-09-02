import Link from "next/link";
import { supabase } from "../../supabase";
import BattleCard from "../../BattleCard";
import { logError } from "../../lib/logger";

export async function getServerSideProps({ params }) {
  try {
    const { data: battle, error } = await supabase
      .from("battles")
      .select(
        "id, slug, votes_a, votes_b, status, question, starts_at, ends_at, views, winner_id, product_a:product_a_id(id, name, slug, description, logo_url, website_url), product_b:product_b_id(id, name, slug, description, logo_url, website_url)"
      )
      .eq("slug", params.slug)
      .single();

    if (error || !battle) {
      if (error) {
        logError("pages/battle/[slug].getServerSideProps", error, {
          slug: params.slug,
        });
      }
      return { notFound: true };
    }

    // Lazily expire this battle if its time is up, even if a stale "live"
    // status is still sitting on the row (mirrors the bulk closer on the
    // homepage, scoped to just this one battle since that's all we have).
    if (
      battle.status === "live" &&
      battle.ends_at &&
      new Date(battle.ends_at) <= new Date()
    ) {
      const winnerId =
        battle.votes_a === battle.votes_b
          ? null
          : battle.votes_a > battle.votes_b
          ? battle.product_a.id
          : battle.product_b.id;
      const { error: closeError } = await supabase
        .from("battles")
        .update({ status: "completed", winner_id: winnerId })
        .eq("id", battle.id);
      if (closeError) {
        logError("pages/battle/[slug].getServerSideProps.autoClose", closeError, {
          battleId: battle.id,
        });
      } else {
        battle.status = "completed";
        battle.winner_id = winnerId;
      }
    }

    // Count this as a view. Best-effort — a failed increment shouldn't
    // block the page from rendering, just gets logged.
    const newViews = (battle.views ?? 0) + 1;
    const { error: viewsError } = await supabase
      .from("battles")
      .update({ views: newViews })
      .eq("id", battle.id);
    if (viewsError) {
      logError("pages/battle/[slug].getServerSideProps.incrementViews", viewsError, {
        battleId: battle.id,
      });
    } else {
      battle.views = newViews;
    }

    return { props: { battle } };
  } catch (err) {
    logError("pages/battle/[slug].getServerSideProps", err, {
      slug: params?.slug,
    });
    // A thrown/network-level error is treated the same as "not found" —
    // the alternative (crashing to Next's default 500 page) hides the
    // real cause from anyone but someone tailing server logs.
    return { notFound: true };
  }
}

export default function BattlePage({ battle }) {
  if (!battle) {
    logError(
      "pages/battle/[slug].render",
      new Error("BattlePage rendered without a battle prop")
    );
    return (
      <div className="mx-auto max-w-3xl px-5 pb-10 pt-6 text-center font-mono text-sm text-grayText">
        This battle couldn't be loaded.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl pb-10 pt-6 lg:max-w-4xl">
      <BattleCard battle={battle} />

      <div className="mx-auto mt-8 grid max-w-xl grid-cols-1 gap-6 px-5 sm:grid-cols-2 md:px-0 lg:max-w-2xl">
        {[battle.product_a, battle.product_b].map((p, i) => (
          <div key={p.id}>
            <Link
              href={`/product/${p.slug}`}
              className={`font-display text-sm uppercase ${
                i === 0 ? "text-cornerA" : "text-cornerB"
              }`}
            >
              {p.name}
            </Link>
            <p className="mt-1 text-xs text-grayText md:text-sm">
              {p.description}
            </p>
            {p.website_url && (
              <a
                href={p.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block rounded-full border border-line px-2.5 py-1 font-mono text-[10px] font-bold text-ink hover:border-cornerB"
              >
                Visit ↗
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
