import { supabase } from "../supabase";
import BattleCard from "../BattleCard";
import LeaderboardTable from "../LeaderboardTable";
import Link from "next/link";

export async function getServerSideProps() {
  const { data: battles } = await supabase
    .from("battles")
    .select(
      "id, slug, votes_a, votes_b, status, product_a:product_a_id(id, name, slug), product_b:product_b_id(id, name, slug)"
    )
    .eq("status", "live")
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: products } = await supabase
    .from("products")
    .select("id, name, slug, rating, wins, losses")
    .eq("status", "active")
    .order("rating", { ascending: false })
    .limit(10);

  return {
    props: {
      liveBattle: battles?.[0] ?? null,
      trending: battles?.slice(1) ?? [],
      products: products ?? [],
    },
  };
}

export default function Home({ liveBattle, trending, products }) {
  return (
    <div className="pb-10">
      <section className="px-5 pt-7 pb-2">
        <h1 className="font-display text-3xl uppercase leading-none tracking-wide">
          The internet
          <br />
          picks the winner.
        </h1>
        <p className="mt-3 text-sm text-grayText">
          Vote in real product battles. No signup required.
        </p>
      </section>

      {liveBattle ? (
        <BattleCard battle={liveBattle} />
      ) : (
        <p className="mx-5 my-6 font-mono text-sm text-grayText">
          No live battle right now — check back soon.
        </p>
      )}

      {trending.length > 0 && (
        <section className="px-5 pb-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-sm uppercase tracking-wide">
              Trending
            </h2>
          </div>
          {trending.map((b) => {
            const total = b.votes_a + b.votes_b;
            const pctA = total > 0 ? Math.round((b.votes_a / total) * 100) : 50;
            const pctB = 100 - pctA;
            return (
              <Link
                key={b.id}
                href={`/battle/${b.slug}`}
                className="block border-b border-line py-3 last:border-none"
              >
                <div className="mb-1 flex justify-between text-sm font-bold">
                  <span>{b.product_a.name}</span>
                  <span className="font-normal text-grayText text-xs">vs</span>
                  <span>{b.product_b.name}</span>
                </div>
                <div className="mb-1 flex h-1 overflow-hidden rounded-full bg-line">
                  <div className="bg-cornerA" style={{ width: `${pctA}%` }} />
                  <div className="bg-cornerB" style={{ width: `${pctB}%` }} />
                </div>
                <div className="font-mono text-[10px] text-grayText">
                  {total.toLocaleString()} votes
                </div>
              </Link>
            );
          })}
        </section>
      )}

      <section className="px-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-sm uppercase tracking-wide">
            Top Products
          </h2>
          <Link href="/rankings" className="font-mono text-[11px] text-grayText">
            Full ranking →
          </Link>
        </div>
        <LeaderboardTable products={products} />
      </section>
    </div>
  );
}
