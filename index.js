import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../supabase";
import BattleCard from "../BattleCard";
import LeaderboardTable from "../LeaderboardTable";
import Link from "next/link";
import { logError, logWarn } from "../lib/logger";

const MAX_DESCRIPTION_LENGTH = 280;

export async function getServerSideProps({ query }) {
  // Safe fallback props returned any time something in here fails, so a
  // Supabase hiccup degrades to an empty-but-working homepage instead of
  // a hard 500. The real cause still gets logged via logError below.
  const fallbackProps = {
    liveBattle: null,
    trending: [],
    products: [],
    categories: [],
    activeCategorySlug: null,
    loadError: null,
  };

  try {
    const { data: battles, error: battlesError } = await supabase
      .from("battles")
      .select(
        "id, slug, votes_a, votes_b, status, product_a:product_a_id(id, name, slug, logo_url), product_b:product_b_id(id, name, slug, logo_url)"
      )
      .eq("status", "live")
      .order("created_at", { ascending: false })
      .limit(5);

    if (battlesError) {
      logError("pages/index.getServerSideProps.battles", battlesError);
    }

    const { data: categories, error: categoriesError } = await supabase
      .from("categories")
      .select("id, name, slug, icon")
      .order("name", { ascending: true });

    if (categoriesError) {
      logError("pages/index.getServerSideProps.categories", categoriesError);
    }

    // Category filter applies to the leaderboard only — a battle pairs two
    // products that can each belong to a different category, so filtering
    // "which battles show" by a single category doesn't map cleanly.
    const activeCategorySlug = query?.category || null;
    const activeCategory = categories?.find(
      (c) => c.slug === activeCategorySlug
    );

    if (activeCategorySlug && !activeCategory) {
      logWarn("pages/index.getServerSideProps", "Unknown category slug in query", {
        activeCategorySlug,
      });
    }

    let productsQuery = supabase
      .from("products")
      .select("id, name, slug, rating, wins, losses, category_id, logo_url")
      .eq("status", "active")
      .order("rating", { ascending: false })
      .limit(10);

    if (activeCategory) {
      productsQuery = productsQuery.eq("category_id", activeCategory.id);
    }

    const { data: products, error: productsError } = await productsQuery;

    if (productsError) {
      logError("pages/index.getServerSideProps.products", productsError);
    }

    return {
      props: {
        liveBattle: battles?.[0] ?? null,
        trending: battles?.slice(1) ?? [],
        products: products ?? [],
        categories: categories ?? [],
        activeCategorySlug: activeCategorySlug ?? null,
        loadError: null,
      },
    };
  } catch (err) {
    // Anything unexpected (network failure, bad env vars, etc.) lands here.
    logError("pages/index.getServerSideProps", err, { query });
    return {
      props: {
        ...fallbackProps,
        loadError: "We couldn't load the latest battles right now.",
      },
    };
  }
}

export default function Home({
  liveBattle,
  trending,
  products,
  categories,
  activeCategorySlug,
  loadError,
}) {
  const router = useRouter();

  function selectCategory(slug) {
    try {
      router.push(slug ? { pathname: "/", query: { category: slug } } : "/");
    } catch (err) {
      logError("pages/index.selectCategory", err, { slug });
    }
  }

  return (
    <div className="mx-auto max-w-6xl pb-12">
      {loadError && (
        <div className="mx-5 mt-4 rounded-lg border border-cornerA bg-cornerADim px-4 py-3 font-mono text-xs text-paper md:mx-8">
          {loadError} Please refresh, or check back shortly.
        </div>
      )}

      {/* ---------- top tabs: Categories + Start a Battle, side by side ---------- */}
      <TopTabs
        categories={categories}
        activeCategorySlug={activeCategorySlug}
        onSelectCategory={selectCategory}
      />

      <section className="px-5 pt-6 pb-2 text-center md:px-8 md:text-left">
        <h1 className="font-display text-3xl uppercase leading-none tracking-wide md:text-5xl lg:text-6xl">
          The internet
          <br />
          picks the winner.
        </h1>
        <p className="mt-3 text-sm text-grayText md:text-base">
          Vote in real product battles. No signup required.
        </p>
      </section>

      {liveBattle ? (
        <BattleCard battle={liveBattle} />
      ) : (
        <p className="mx-5 my-6 text-center font-mono text-sm text-grayText md:mx-8 md:text-left">
          No live battle right now — check back soon.
        </p>
      )}

      {trending.length > 0 && (
        <section className="px-5 py-8 md:px-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-sm uppercase tracking-wide">
              Trending
            </h2>
          </div>
          <div className="md:grid md:grid-cols-2 md:gap-x-10 lg:grid-cols-3">
            {trending.map((b) => {
              const total = b.votes_a + b.votes_b;
              const pctA =
                total > 0 ? Math.round((b.votes_a / total) * 100) : 50;
              const pctB = 100 - pctA;
              return (
                <Link
                  key={b.id}
                  href={`/battle/${b.slug}`}
                  className="block border-b border-line py-3 last:border-none"
                >
                  <div className="mb-1 flex justify-between text-sm font-bold">
                    <span>{b.product_a.name}</span>
                    <span className="text-xs font-normal text-grayText">vs</span>
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
          </div>
        </section>
      )}

      <section className="px-5 md:px-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-sm uppercase tracking-wide">
            Top Products
            {activeCategorySlug && (
              <span className="ml-2 font-mono text-[11px] font-normal text-grayText">
                in {categories.find((c) => c.slug === activeCategorySlug)?.name}
              </span>
            )}
          </h2>
          <Link href="/rankings" className="font-mono text-[11px] text-grayText">
            Full ranking →
          </Link>
        </div>
        {products.length === 0 ? (
          <p className="py-6 font-mono text-xs text-grayText">
            No products in this category yet.
          </p>
        ) : (
          <LeaderboardTable products={products} />
        )}
      </section>
    </div>
  );
}

// ---------- top tabs ----------
// "Categories" and "Start a Battle" sit side by side. Pressing either
// expands its panel inline below — never a native <select> or a
// modal/popup. Only one panel is open at a time (accordion-style).
function TopTabs({ categories, activeCategorySlug, onSelectCategory }) {
  const [openTab, setOpenTab] = useState(null); // null | "categories" | "battle"

  if (!categories || categories.length === 0) return null;

  const activeCategory = categories.find((c) => c.slug === activeCategorySlug);

  function toggle(tab) {
    try {
      setOpenTab((cur) => (cur === tab ? null : tab));
    } catch (err) {
      logError("pages/index.TopTabs.toggle", err, { tab });
    }
  }

  function handleSelectCategory(slug) {
    onSelectCategory(slug);
    setOpenTab(null);
  }

  return (
    <section className="border-b border-line bg-white px-5 py-3 md:px-8">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => toggle("categories")}
          aria-expanded={openTab === "categories"}
          className="flex items-center gap-2 rounded-full border border-line bg-paper px-4 py-2 text-xs font-bold text-ink transition-colors hover:border-cornerA"
        >
          <span>
            {activeCategory
              ? `${activeCategory.icon} ${activeCategory.name}`
              : "Categories"}
          </span>
          <span
            className={`font-mono text-[10px] transition-transform ${
              openTab === "categories" ? "rotate-180" : ""
            }`}
          >
            ▾
          </span>
        </button>

        <button
          type="button"
          onClick={() => toggle("battle")}
          aria-expanded={openTab === "battle"}
          className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition-colors ${
            openTab === "battle"
              ? "border-cornerA bg-cornerA text-white"
              : "border-cornerA bg-white text-cornerA hover:bg-cornerA hover:text-white"
          }`}
        >
          ⚔️ Start a Battle
        </button>
      </div>

      {openTab === "categories" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleSelectCategory(null)}
            aria-pressed={!activeCategorySlug}
            className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-xs font-bold transition-colors ${
              !activeCategorySlug
                ? "border-cornerA bg-cornerA text-white"
                : "border-line bg-paper text-ink hover:border-cornerA"
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => handleSelectCategory(c.slug)}
              aria-pressed={activeCategorySlug === c.slug}
              className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-xs font-bold transition-colors ${
                activeCategorySlug === c.slug
                  ? "border-cornerA bg-cornerA text-white"
                  : "border-line bg-paper text-ink hover:border-cornerA"
              }`}
            >
              {c.icon} {c.name}
            </button>
          ))}
        </div>
      )}

      {openTab === "battle" && <StartBattlePanel categories={categories} />}
    </section>
  );
}

// ---------- start a battle ----------
function StartBattlePanel({ categories }) {
  const router = useRouter();
  const [yourProduct, setYourProduct] = useState(null);
  const [opponentProduct, setOpponentProduct] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  async function startBattle() {
    if (!yourProduct || !opponentProduct || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          productAId: yourProduct.id,
          productBId: opponentProduct.id,
        }),
      });
      const body = await res.json().catch((parseErr) => {
        logError("StartBattlePanel.startBattle.parseResponse", parseErr);
        return {};
      });
      if (!res.ok) throw new Error(body.error || "Could not start battle");
      router.push(`/battle/${body.battle.slug}`);
    } catch (err) {
      logError("StartBattlePanel.startBattle", err, {
        yourProductId: yourProduct?.id,
        opponentProductId: opponentProduct?.id,
      });
      setCreateError(err.message || "Something went wrong starting the battle.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-line bg-paper p-3">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex-1">
          <ProductSlot
            label="Your product"
            selectedProduct={yourProduct}
            onSelect={setYourProduct}
            onClear={() => setYourProduct(null)}
            categories={categories}
            showRecommended={false}
          />
        </div>

        <div className="text-center font-display text-xs text-grayText sm:pt-8">
          VS
        </div>

        <div className="flex-1">
          {yourProduct ? (
            <ProductSlot
              label="Opponent"
              selectedProduct={opponentProduct}
              onSelect={setOpponentProduct}
              onClear={() => setOpponentProduct(null)}
              categories={categories}
              showRecommended
              recommendCategoryId={yourProduct.category_id}
              excludeProductId={yourProduct.id}
            />
          ) : (
            <div>
              <div className="mb-1.5 font-mono text-[10px] uppercase text-grayText">
                Opponent
              </div>
              <div className="font-mono text-[11px] text-grayText">
                Pick your product first.
              </div>
            </div>
          )}
        </div>
      </div>

      {yourProduct && opponentProduct && (
        <div className="mt-4 rounded-lg border border-line bg-white p-3">
          <div className="mb-3 text-center text-sm font-bold">
            {yourProduct.name} 🆚 {opponentProduct.name}
          </div>
          <button
            type="button"
            onClick={startBattle}
            disabled={creating}
            className="w-full rounded-lg bg-cornerA px-4 py-3 font-display text-xs uppercase tracking-wide text-white disabled:opacity-60"
          >
            {creating ? "Starting…" : "Start Battle"}
          </button>
          {createError && (
            <div className="mt-2 text-center font-mono text-[10px] text-cornerA">
              {createError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// A single "pick a product" slot: search box + results, "+ Add your
// product" for creating a new one inline, and (for the opponent slot)
// recommended-opponent chips based on the other side's category.
function ProductSlot({
  label,
  selectedProduct,
  onSelect,
  onClear,
  categories,
  showRecommended,
  recommendCategoryId,
  excludeProductId,
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [recommended, setRecommended] = useState([]);
  const [recommendedError, setRecommendedError] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!showRecommended || !recommendCategoryId || selectedProduct) {
      setRecommended([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ category: recommendCategoryId });
        if (excludeProductId) params.set("exclude", excludeProductId);
        const res = await fetch(`/api/submit-product?${params.toString()}`);
        const body = await res.json().catch((parseErr) => {
          logError("ProductSlot.fetchRecommended.parseResponse", parseErr);
          return {};
        });
        if (!res.ok) throw new Error(body.error || "Could not load recommendations");
        if (!cancelled) setRecommended(body.products || []);
      } catch (err) {
        logError("ProductSlot.fetchRecommended", err, { recommendCategoryId });
        if (!cancelled) setRecommendedError("Couldn't load recommendations.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showRecommended, recommendCategoryId, excludeProductId, selectedProduct]);

  async function runSearch(term) {
    setQuery(term);
    if (abortRef.current) abortRef.current.abort();

    if (!term || term.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(
        `/api/submit-product?q=${encodeURIComponent(term.trim())}`,
        { signal: controller.signal }
      );
      const body = await res.json().catch((parseErr) => {
        logError("ProductSlot.runSearch.parseResponse", parseErr);
        return {};
      });
      if (!res.ok) throw new Error(body.error || "Search failed");
      setResults(body.products || []);
    } catch (err) {
      if (err.name === "AbortError") return;
      logError("ProductSlot.runSearch", err, { term });
      setSearchError("Search failed. Try again.");
    } finally {
      setSearching(false);
    }
  }

  function handleSelect(product) {
    try {
      onSelect(product);
      setQuery("");
      setResults([]);
      setShowAddForm(false);
    } catch (err) {
      logError("ProductSlot.handleSelect", err, { productId: product?.id });
    }
  }

  if (selectedProduct) {
    return (
      <div>
        <div className="mb-1.5 font-mono text-[10px] uppercase text-grayText">
          {label}
        </div>
        <div className="flex items-center justify-between rounded-lg border border-line bg-white px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-paper font-display text-xs">
              {selectedProduct.logo_url ? (
                <img
                  src={selectedProduct.logo_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                selectedProduct.name[0]
              )}
            </div>
            <div className="min-w-0 truncate text-sm font-bold">
              {selectedProduct.name}
            </div>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 font-mono text-[11px] text-grayText hover:text-cornerA"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1.5 font-mono text-[10px] uppercase text-grayText">
        {label}
      </div>
      <input
        value={query}
        onChange={(e) => runSearch(e.target.value)}
        placeholder="Search products…"
        className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none placeholder:text-grayText"
      />

      {searching && (
        <div className="mt-1 font-mono text-[10px] text-grayText">Searching…</div>
      )}
      {searchError && (
        <div className="mt-1 font-mono text-[10px] text-cornerA">{searchError}</div>
      )}

      {results.length > 0 && (
        <div className="mt-2 divide-y divide-line rounded-lg border border-line bg-white">
          {results.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => handleSelect(p)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-paper"
            >
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-paper font-display text-[10px]">
                  {p.logo_url ? (
                    <img
                      src={p.logo_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    p.name[0]
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{p.name}</div>
                  <div className="font-mono text-[10px] text-grayText">
                    {p.category?.name || "Uncategorized"} · {p.rating} rating
                  </div>
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-line px-2.5 py-1 font-mono text-[10px] font-bold">
                Select
              </span>
            </button>
          ))}
        </div>
      )}

      {!showAddForm && (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="mt-2 font-mono text-[11px] font-bold text-cornerB"
        >
          + Add your product
        </button>
      )}

      {showAddForm && (
        <AddProductForm
          categories={categories}
          onCancel={() => setShowAddForm(false)}
          onCreated={handleSelect}
        />
      )}

      {showRecommended && recommendCategoryId && (
        <div className="mt-4">
          <div className="mb-2 font-mono text-[10px] uppercase text-grayText">
            🔥 Recommended opponents
          </div>
          {recommendedError && (
            <div className="font-mono text-[10px] text-cornerA">
              {recommendedError}
            </div>
          )}
          {recommended.length === 0 && !recommendedError && (
            <div className="font-mono text-[10px] text-grayText">
              No suggestions yet.
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {recommended.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => handleSelect(p)}
                className="flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-bold hover:border-cornerB"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-paper font-display text-[9px]">
                  {p.logo_url ? (
                    <img
                      src={p.logo_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    p.name[0]
                  )}
                </span>
                {p.name}
                <span className="text-grayText">· {p.category?.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// The "+ Add your product" mini form. Name, website, category, logo (PNG,
// ≤2MB — matches the Supabase "logos" bucket limits), and description are
// all required — no partial listings.
function AddProductForm({ categories, onCancel, onCreated }) {
  const [name, setName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | error
  const [message, setMessage] = useState("");

  function handleLogoChange(e) {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.type !== "image/png") {
        setStatus("error");
        setMessage("Logo must be a PNG image.");
        logWarn("AddProductForm.handleLogoChange", "Rejected non-PNG file", {
          fileType: file.type,
        });
        return;
      }
      if (file.size > 2_000_000) {
        setStatus("error");
        setMessage("Logo must be smaller than 2MB.");
        logWarn("AddProductForm.handleLogoChange", "Rejected oversized file", {
          fileSize: file.size,
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        setLogoDataUrl(reader.result);
        setLogoPreview(reader.result);
        setStatus("idle");
        setMessage("");
      };
      reader.onerror = () => {
        logError("AddProductForm.handleLogoChange.FileReader", reader.error);
        setStatus("error");
        setMessage("Couldn't read that image file.");
      };
      reader.readAsDataURL(file);
    } catch (err) {
      logError("AddProductForm.handleLogoChange", err);
      setStatus("error");
      setMessage("Something went wrong reading that file.");
    }
  }

  function toggleCategory(id) {
    try {
      setCategoryId((cur) => (cur === id ? "" : id));
    } catch (err) {
      logError("AddProductForm.toggleCategory", err, { id });
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (
      !name.trim() ||
      !websiteUrl.trim() ||
      !categoryId ||
      !description.trim() ||
      !logoDataUrl
    ) {
      setStatus("error");
      setMessage(
        "Product name, website, category, logo, and description are all required."
      );
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch("/api/submit-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          websiteUrl,
          categoryId,
          description,
          logoDataUrl,
        }),
      });
      const body = await res.json().catch((parseErr) => {
        logError("AddProductForm.handleSubmit.parseResponse", parseErr);
        return {};
      });
      if (!res.ok) throw new Error(body.error || "Submission failed");
      onCreated(body.product);
    } catch (err) {
      logError("AddProductForm.handleSubmit", err, {
        name,
        websiteUrl,
        categoryId,
      });
      setStatus("error");
      setMessage(err.message || "Something went wrong. Please try again.");
    }
  }

  const selectedCategory = categories.find((c) => c.id === categoryId);

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 flex flex-col gap-3 rounded-lg border border-line bg-white p-3"
    >
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase text-grayText">
          Add your product
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="font-mono text-[10px] text-grayText hover:text-cornerA"
        >
          Cancel
        </button>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-line bg-paper text-[9px] text-grayText">
          {logoPreview ? (
            <img src={logoPreview} alt="" className="h-full w-full object-cover" />
          ) : (
            "PNG"
          )}
          <input
            type="file"
            accept="image/png"
            onChange={handleLogoChange}
            className="hidden"
          />
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Product name"
          className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none placeholder:text-grayText"
        />
      </div>

      <input
        value={websiteUrl}
        onChange={(e) => setWebsiteUrl(e.target.value)}
        placeholder="Website URL"
        className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none placeholder:text-grayText"
      />

      <div>
        <div className="mb-1.5 font-mono text-[10px] uppercase text-grayText">
          Category{selectedCategory ? ` — ${selectedCategory.name}` : ""}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => toggleCategory(c.id)}
              aria-pressed={categoryId === c.id}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
                categoryId === c.id
                  ? "border-cornerB bg-cornerB text-white"
                  : "border-line bg-paper text-ink hover:border-cornerB"
              }`}
            >
              {c.icon} {c.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <textarea
          value={description}
          onChange={(e) =>
            setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))
          }
          placeholder="Short description"
          rows={2}
          maxLength={MAX_DESCRIPTION_LENGTH}
          className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none placeholder:text-grayText"
        />
        <div className="mt-1 text-right font-mono text-[10px] text-grayText">
          {description.length}/{MAX_DESCRIPTION_LENGTH}
        </div>
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        className="rounded-lg bg-cornerB px-4 py-2.5 font-display text-[11px] uppercase tracking-wide text-white disabled:opacity-60"
      >
        {status === "loading" ? "Adding…" : "Add & Continue"}
      </button>

      {message && (
        <div
          className={`font-mono text-[10px] ${
            status === "error" ? "text-cornerA" : "text-grayText"
          }`}
        >
          {message}
        </div>
      )}
    </form>
  );
}
