import { supabase } from "../../supabase";
import BattleCard from "../../BattleCard";

export async function getServerSideProps({ params }) {
  const { data: battle } = await supabase
    .from("battles")
    .select(
      "id, slug, votes_a, votes_b, status, product_a:product_a_id(id, name, slug, description), product_b:product_b_id(id, name, slug, description)"
    )
    .eq("slug", params.slug)
    .single();

  if (!battle) {
    return { notFound: true };
  }

  return { props: { battle } };
}

export default function BattlePage({ battle }) {
  return (
    <div className="mx-auto max-w-3xl pb-10 pt-6">
      <BattleCard battle={battle} live={battle.status === "live"} />

      <div className="mx-auto mt-8 grid max-w-xl grid-cols-1 gap-6 px-5 sm:grid-cols-2 md:px-0">
        <div>
          <div className="font-display text-sm uppercase text-cornerA">
            {battle.product_a.name}
          </div>
          <p className="mt-1 text-xs text-grayText">
            {battle.product_a.description}
          </p>
        </div>
        <div>
          <div className="font-display text-sm uppercase text-cornerB">
            {battle.product_b.name}
          </div>
          <p className="mt-1 text-xs text-grayText">
            {battle.product_b.description}
          </p>
        </div>
      </div>
    </div>
  );
}
