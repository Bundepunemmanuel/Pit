import { supabase } from "../../supabase";
import Link from "next/link";

export async function getServerSideProps({ params }) {
  const { data: product } = await supabase
    .from("products")
    .select("*, category:category_id(name, icon)")
    .eq("slug", params.slug)
    .single();

  if (!product) {
    return { notFound: true };
  }

  const { data: battles } = await supabase
    .from("battles")
    .select(
      "id, slug, status, votes_a, votes_b, product_a_id, product_b_id, product_a:product_a_id(name, slug), product_b:product_b_id(name, slug)"
    )
    .or(`product_a_id.eq.${product.id},product_b_id.eq.${product.id}`)
    .order("created_at", { ascending: false })
    .limit(20);

  return { props: { product, battles: battles ?? [] } };
}

export default function ProductPage({ product, battles }) {
  const total = product.wins + product.losses;
  const winRate = total > 0 ? Math.round((product.wins / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl px-5 pb-10 pt-6 md:px-8">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-line bg-paperCard font-display text-xl">
          {product.name[0]}
        </div>
        <div>
          <h1 className="font-display text-xl uppercase">{product.name}</h1>
          {product.category && (
            <div className="font-mono text-[11px] text-grayText">
              {product.category.icon} {product.category.name}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl border border-line bg-paperCard py-3">
          <div className="font-mono text-lg font-bold">{product.rating}</div>
          <div className="font-mono text-[10px] text-grayText">RATING</div>
        </div>
        <div className="rounded-xl border border-line bg-paperCard py-3">
          <div className="font-mono text-lg font-bold">
            {product.wins}-{product.losses}
          </div>
          <div className="font-mono text-[10px] text-grayText">RECORD</div>
        </div>
        <div className="rounded-xl border border-line bg-paperCard py-3">
          <div className="font-mono text-lg font-bold">{winRate}%</div>
          <div className="font-mono text-[10px] text-grayText">WIN RATE</div>
        </div>
      </div>

      {product.description && (
        <p className="mt-6 text-sm text-grayText">{product.description}</p>
      )}

      <h2 className="mt-8 mb-3 font-display text-sm uppercase tracking-wide">
        Battle History
      </h2>
      {battles.length === 0 && (
        <p className="font-mono text-xs text-grayText">No battles yet.</p>
      )}
      {battles.map((b) => {
        const opponent =
          b.product_a_id === product.id ? b.product_b : b.product_a;
        return (
          <Link
            key={b.id}
            href={`/battle/${b.slug}`}
            className="flex items-center justify-between border-b border-line py-3 last:border-none"
          >
            <span className="text-sm font-bold">vs {opponent.name}</span>
            <span className="font-mono text-[11px] uppercase text-grayText">
              {b.status}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
