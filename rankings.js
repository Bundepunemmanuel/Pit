import { supabase } from "../supabase";
import LeaderboardTable from "../LeaderboardTable";
import { logError } from "../lib/logger";

export async function getServerSideProps() {
  try {
    const { data: products, error } = await supabase
      .from("products")
      .select("id, name, slug, rating, wins, losses")
      .eq("status", "active")
      .order("rating", { ascending: false });

    if (error) {
      logError("pages/rankings.getServerSideProps", error);
    }

    return { props: { products: products ?? [], loadError: error ? true : false } };
  } catch (err) {
    logError("pages/rankings.getServerSideProps", err);
    return { props: { products: [], loadError: true } };
  }
}

export default function Rankings({ products, loadError }) {
  return (
    <div className="mx-auto max-w-4xl px-5 pb-10 pt-6 md:px-8">
      <h1 className="mb-1 font-display text-2xl uppercase tracking-wide md:text-3xl">
        Rankings
      </h1>
      <p className="mb-6 font-mono text-[11px] text-grayText">
        Ranked by rating · updated after every vote
      </p>
      {loadError && (
        <div className="mb-6 rounded-lg border border-cornerA bg-cornerADim px-4 py-3 font-mono text-xs text-paper">
          We couldn't load the full rankings right now. Please refresh.
        </div>
      )}
      {products.length === 0 && !loadError && (
        <p className="font-mono text-xs text-grayText">No products yet.</p>
      )}
      <LeaderboardTable products={products} />
    </div>
  );
}
