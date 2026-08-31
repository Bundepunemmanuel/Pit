import { supabase } from "../../supabase";
import BattleCard from "../../BattleCard";
import { logError } from "../../lib/logger";

export async function getServerSideProps({ params }) {
  try {
    const { data: battle, error } = await supabase
      .from("battles")
      .select(
        "id, slug, votes_a, votes_b, status, product_a:product_a_id(id, name, slug, description, logo_url), product_b:product_b_id(id, name, slug, description, logo_url)"
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
      <BattleCard battle={battle} live={battle.status === "live"} />

      <div className="mx-auto mt-8 grid max-w-xl grid-cols-1 gap-6 px-5 sm:grid-cols-2 md:px-0 lg:max-w-2xl">
        <div>
          <div className="font-display text-sm uppercase text-cornerA">
            {battle.product_a.name}
          </div>
          <p className="mt-1 text-xs text-grayText md:text-sm">
            {battle.product_a.description}
          </p>
        </div>
        <div>
          <div className="font-display text-sm uppercase text-cornerB">
            {battle.product_b.name}
          </div>
          <p className="mt-1 text-xs text-grayText md:text-sm">
            {battle.product_b.description}
          </p>
        </div>
      </div>
    </div>
  );
}
