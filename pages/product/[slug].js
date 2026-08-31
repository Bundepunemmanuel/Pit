import { supabase } from "../../supabase";
import Link from "next/link";
import { logError } from "../../lib/logger";

export async function getServerSideProps({ params }) {
  try {
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("*, category:category_id(name, icon)")
      .eq("slug", params.slug)
      .single();

    if (productError || !product) {
      if (productError) {
        logError("pages/product/[slug].getServerSideProps.product", productError, {
          slug: params.slug,
        });
      }
      return { notFound: true };
    }

    const { data: battles, error: battlesError } = await supabase
      .from("battles")
      .select(
        "id, slug, status, votes_a, votes_b, product_a_id, product_b_id, product_a:product_a_id(name, slug), product_b:product_b_id(name, slug)"
      )
      .or(`product_a_id.eq.${product.id},product_b_id.eq.${product.id}`)
      .order("created_at", { ascending: false })
      .limit(20);

    if (battlesError) {
      logError("pages/product/[slug].getServerSideProps.battles", battlesError, {
        productId: product.id,
      });
    }

    return { props: { product, battles: battles ?? [] } };
  } catch (err) {
    logError("pages/product/[slug].getServerSideProps", err, {
      slug: params?.slug,
    });
    return { notFound: true };
  }
}

export default function ProductPage({ product, battles }) {
  if (!product) {
    logError(
      "pages/product/[slug].render",
      new Error("ProductPage rendered without a product prop")
    );
    return (
      <div className="mx-auto max-w-2xl px-5 pb-10 pt-6 text-center font-mono text-sm text-grayText">
        This product couldn't be loaded.
      </div>
    );
  }

  const total = (product.wins ?? 0) + (product.losses ?? 0);
  const winRate = total > 0 ? Math.round((product.wins / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-2xl px-5 pb-10 pt-6 md:px-8 lg:max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-white font-display text-xl md:h-16 md:w-16">
          {product.logo_url ? (
            <img
              src={product.logo_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            product.name?.[0] ?? "?"
          )}
        </div>
        <div>
          <h1 className="font-display text-xl uppercase md:text-2xl">
            {product.name}
          </h1>
          {product.category && (
            <div className="font-mono text-[11px] text-grayText">
              {product.category.icon} {product.category.name}
            </div>
          )}
          {product.website_url && (
            <a
              href={product.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11px] text-cornerB underline"
            >
              {product.website_url.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 text-center md:max-w-md">
        <div className="rounded-xl border border-line bg-white py-3">
          <div className="font-mono text-lg font-bold">{product.rating}</div>
          <div className="font-mono text-[10px] text-grayText">RATING</div>
        </div>
        <div className="rounded-xl border border-line bg-white py-3">
          <div className="font-mono text-lg font-bold">
            {product.wins}-{product.losses}
          </div>
          <div className="font-mono text-[10px] text-grayText">RECORD</div>
        </div>
        <div className="rounded-xl border border-line bg-white py-3">
          <div className="font-mono text-lg font-bold">{winRate}%</div>
          <div className="font-mono text-[10px] text-grayText">WIN RATE</div>
        </div>
      </div>

      {product.description && (
        <p className="mt-6 text-sm text-grayText md:text-base">
          {product.description}
        </p>
      )}

      <h2 className="mt-8 mb-3 font-display text-sm uppercase tracking-wide">
        Battle History
      </h2>
      {battles.length === 0 && (
        <p className="font-mono text-xs text-grayText">No battles yet.</p>
      )}
      <div className="md:grid md:grid-cols-2 md:gap-x-10">
        {battles.map((b) => {
          if (!b || (!b.product_a && !b.product_b)) {
            logError(
              "pages/product/[slug].render",
              new Error("Malformed battle row in history"),
              { battle: b }
            );
            return null;
          }
          const opponent =
            b.product_a_id === product.id ? b.product_b : b.product_a;
          return (
            <Link
              key={b.id}
              href={`/battle/${b.slug}`}
              className="flex items-center justify-between border-b border-line py-3 last:border-none"
            >
              <span className="text-sm font-bold">vs {opponent?.name ?? "Unknown"}</span>
              <span className="font-mono text-[11px] uppercase text-grayText">
                {b.status}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
