import { supabase } from "../supabase";
import LeaderboardTable from "../LeaderboardTable";

export async function getServerSideProps() {
  const { data: products } = await supabase
    .from("products")
    .select("id, name, slug, rating, wins, losses")
    .eq("status", "active")
    .order("rating", { ascending: false });

  return { props: { products: products ?? [] } };
}

export default function Rankings({ products }) {
  return (
    <div className="px-5 pb-10 pt-6">
      <h1 className="mb-1 font-display text-2xl uppercase tracking-wide">
        Rankings
      </h1>
      <p className="mb-6 font-mono text-[11px] text-grayText">
        Ranked by rating · updated after every vote
      </p>
      <LeaderboardTable products={products} />
    </div>
  );
}
