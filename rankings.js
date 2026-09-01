import { useRouter } from "next/router";
import { supabase } from "../supabase";
import LeaderboardTable from "../LeaderboardTable";
import { logError, logWarn } from "../lib/logger";

export async function getServerSideProps({ query }) {
  const fallbackProps = {
    products: [],
    categories: [],
    activeCategorySlug: null,
    loadError: false,
  };

  try {
    const { data: categories, error: categoriesError } = await supabase
      .from("categories")
      .select("id, name, slug, icon")
      .order("name", { ascending: true });

    if (categoriesError) {
      logError("pages/rankings.getServerSideProps.categories", categoriesError);
    }

    const activeCategorySlug = query?.category || null;
    const activeCategory = categories?.find((c) => c.slug === activeCategorySlug);

    if (activeCategorySlug && !activeCategory) {
      logWarn("pages/rankings.getServerSideProps", "Unknown category slug in query", {
        activeCategorySlug,
      });
    }

    let productsQuery = supabase
      .from("products")
      .select(
        "id, name, slug, rating, wins, losses, category_id, logo_url, category:category_id(name, icon)"
      )
      .eq("status", "active")
      .order("rating", { ascending: false });

    if (activeCategory) {
      productsQuery = productsQuery.eq("category_id", activeCategory.id);
    }

    const { data: products, error: productsError } = await productsQuery;

    if (productsError) {
      logError("pages/rankings.getServerSideProps.products", productsError);
    }

    return {
      props: {
        products: products ?? [],
        categories: categories ?? [],
        activeCategorySlug: activeCategorySlug ?? null,
        loadError: Boolean(productsError),
      },
    };
  } catch (err) {
    logError("pages/rankings.getServerSideProps", err, { query });
    return { props: { ...fallbackProps, loadError: true } };
  }
}

export default function Rankings({
  products,
  categories,
  activeCategorySlug,
  loadError,
}) {
  const router = useRouter();
  const activeCategory = categories.find((c) => c.slug === activeCategorySlug);

  function selectCategory(slug) {
    try {
      router.push(
        slug ? { pathname: "/rankings", query: { category: slug } } : "/rankings"
      );
    } catch (err) {
      logError("pages/rankings.selectCategory", err, { slug });
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-5 pb-10 pt-6 md:px-8">
      <h1 className="mb-1 font-display text-2xl uppercase tracking-wide md:text-3xl">
        Rankings
      </h1>
      <p className="mb-4 font-mono text-[11px] text-grayText">
        Ranked by rating · +64 for a win, −64 for a loss, floor of 0 ·
        updated after every vote
      </p>

      {categories.length > 0 && (
        <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => selectCategory(null)}
            aria-pressed={!activeCategorySlug}
            className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-xs font-bold transition-colors ${
              !activeCategorySlug
                ? "border-cornerA bg-cornerA text-white"
                : "border-line bg-white text-ink hover:border-cornerA"
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => selectCategory(c.slug)}
              aria-pressed={activeCategorySlug === c.slug}
              className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-xs font-bold transition-colors ${
                activeCategorySlug === c.slug
                  ? "border-cornerA bg-cornerA text-white"
                  : "border-line bg-white text-ink hover:border-cornerA"
              }`}
            >
              {c.icon} {c.name}
            </button>
          ))}
        </div>
      )}

      {loadError && (
        <div className="mb-6 rounded-lg border border-cornerA bg-cornerADim px-4 py-3 font-mono text-xs text-paper">
          We couldn't load the full rankings right now. Please refresh.
        </div>
      )}
      {products.length === 0 && !loadError && (
        <p className="font-mono text-xs text-grayText">
          {activeCategory
            ? `No products in ${activeCategory.name} yet.`
            : "No products yet."}
        </p>
      )}
      <LeaderboardTable products={products} />
    </div>
  );
}
