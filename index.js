import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../supabase";
import BattleCard from "../BattleCard";
import LeaderboardTable from "../LeaderboardTable";
import Link from "next/link";
import { logError, logWarn } from "../lib/logger";

const MAX_DESCRIPTION_LENGTH = 280;

// Lazily flips any "live" battle whose ends_at has passed to "completed",
// setting winner_id from whichever side has more votes (null if tied).
// No cron job for the MVP — this just runs whenever the homepage loads.
async function closeExpiredBattles(supabaseClient) {
  const nowIso = new Date().toISOString();
  const { data: expired, error: fetchError } = await supabaseClient
    .from("battles")
    .select("id, votes_a, votes_b, product_a_id, product_b_id")
    .eq("status", "live")
    .lt("ends_at", nowIso);

  if (fetchError) {
    logError("pages/index.closeExpiredBattles.fetch", fetchError);
    return;
  }
  if (!expired || expired.length === 0) return;

  for (const b of expired) {
    const winnerId =
      b.votes_a === b.votes_b
        ? null
        : b.votes_a > b.votes_b
        ? b.product_a_id
        : b.product_b_id;
    const { error: updateError } = await supabaseClient
      .from("battles")
      .update({ status: "completed", winner_id: winnerId })
      .eq("id", b.id);
    if (updateError) {
      logError("pages/index.closeExpiredBattles.update", updateError, {
        battleId: b.id,
      });
    }
  }
}

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
    await closeExpiredBattles(supabase);

    const nowIso = new Date().toISOString();
    // Battles created before the duration feature shipped have no
    // ends_at (null) — treat those as never-expiring rather than hiding
    // them.
    const { data: battles, error: battlesError } = await supabase
      .from("battles")
      .select(
        "id, slug, votes_a, votes_b, status, question, starts_at, ends_at, views, winner_id, product_a:product_a_id(id, name, slug, logo_url), product_b:product_b_id(id, name, slug, logo_url)"
      )
      .eq("status", "live")
      .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
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
      .select("id, name, slug, rating, wins, losses, category_id, logo_url, category:category_id(name, icon)")
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

      {/* ---------- top tabs: Categories + Challenge a competitor, side by side ---------- */}
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
                  <div className="flex justify-between font-mono text-[10px] text-grayText">
                    <span>{total.toLocaleString()} votes</span>
                    <span>{(b.views ?? 0).toLocaleString()} views</span>
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
// "Categories" and "Challenge a competitor" sit side by side. Pressing either
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
          ⚔️ Challenge a competitor
        </button>
      </div>

      {/* Horizontally scrollable, never wraps — same on the homepage bar
          and inside the battle-creation form's category picker below. */}
      {openTab === "categories" && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
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

// ---------- challenge a competitor ----------
// One input, not a multi-step form: "yourproduct.com vs competitor.com".
// No "your product" framing anywhere in the results either — this app
// has no accounts, so nobody actually owns a product listing.
const DURATIONS = [
  { value: "1h", label: "1 Hour" },
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
];

function StartBattlePanel({ categories }) {
  const router = useRouter();
  const [combinedInput, setCombinedInput] = useState("");
  const [parseError, setParseError] = useState(null);
  const [sideA, setSideA] = useState(null); // { term, selectedProduct }
  const [sideB, setSideB] = useState(null);
  const [question, setQuestion] = useState("");
  const [questionEdited, setQuestionEdited] = useState(false);
  const [duration, setDuration] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  // Once both sides are resolved, prefill a sensible default question —
  // but don't clobber it if the person already started editing it.
  useEffect(() => {
    if (sideA?.selectedProduct && sideB?.selectedProduct && !questionEdited) {
      setQuestion(
        `Which is better: ${sideA.selectedProduct.name} or ${sideB.selectedProduct.name}?`
      );
    }
  }, [sideA?.selectedProduct, sideB?.selectedProduct, questionEdited]);

  function handleFindMatch(e) {
    e.preventDefault();
    try {
      const parts = combinedInput.split(/\s+vs\.?\s+/i);
      if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
        setParseError('Try: yourproduct.com vs competitor.com');
        return;
      }
      setParseError(null);
      setSideA({ term: parts[0].trim(), selectedProduct: null });
      setSideB({ term: parts[1].trim(), selectedProduct: null });
      setQuestionEdited(false);
    } catch (err) {
      logError("StartBattlePanel.handleFindMatch", err, { combinedInput });
      setParseError("Something went wrong reading that. Try again.");
    }
  }

  function reset() {
    setCombinedInput("");
    setParseError(null);
    setSideA(null);
    setSideB(null);
    setQuestion("");
    setQuestionEdited(false);
    setDuration(null);
    setCreateError(null);
  }

  async function startBattle() {
    const productA = sideA?.selectedProduct;
    const productB = sideB?.selectedProduct;
    if (!productA || !productB || !duration || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          productAId: productA.id,
          productBId: productB.id,
          duration,
          question,
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
        productAId: productA?.id,
        productBId: productB?.id,
        duration,
      });
      setCreateError(err.message || "Something went wrong starting the battle.");
    } finally {
      setCreating(false);
    }
  }

  const bothResolved = sideA?.selectedProduct && sideB?.selectedProduct;

  return (
    <div className="mt-3 rounded-lg border border-line bg-paper p-3">
      {!sideA && !sideB ? (
        <form onSubmit={handleFindMatch} className="flex flex-col gap-2">
          <div className="font-mono text-[10px] uppercase text-grayText">
            Who should your product battle?
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={combinedInput}
              onChange={(e) => setCombinedInput(e.target.value)}
              placeholder="yourproduct.com vs competitor.com"
              className="flex-1 rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none placeholder:text-grayText"
            />
            <button
              type="submit"
              className="rounded-lg bg-cornerA px-4 py-2.5 font-display text-xs uppercase tracking-wide text-white"
            >
              Find match
            </button>
          </div>
          {parseError && (
            <div className="font-mono text-[10px] text-cornerA">{parseError}</div>
          )}
        </form>
      ) : (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase text-grayText">
              {combinedInput}
            </div>
            <button
              type="button"
              onClick={reset}
              className="font-mono text-[10px] text-grayText hover:text-cornerA"
            >
              Start over
            </button>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex-1">
              <ProductSlot
                label="Product A"
                initialTerm={sideA.term}
                selectedProduct={sideA.selectedProduct}
                onSelect={(p) => setSideA({ ...sideA, selectedProduct: p })}
                onClear={() => setSideA({ ...sideA, selectedProduct: null })}
                categories={categories}
              />
            </div>
            <div className="text-center font-display text-xs text-grayText sm:pt-8">
              VS
            </div>
            <div className="flex-1">
              <ProductSlot
                label="Product B"
                initialTerm={sideB.term}
                selectedProduct={sideB.selectedProduct}
                onSelect={(p) => setSideB({ ...sideB, selectedProduct: p })}
                onClear={() => setSideB({ ...sideB, selectedProduct: null })}
                categories={categories}
              />
            </div>
          </div>

          {bothResolved && (
            <div className="mt-4 rounded-lg border border-line bg-white p-3">
              <div className="mb-3 text-center text-sm font-bold">
                {sideA.selectedProduct.name} 🆚 {sideB.selectedProduct.name}
              </div>

              <div className="mb-3">
                <div className="mb-1.5 font-mono text-[10px] uppercase text-grayText">
                  Battle question
                </div>
                <input
                  value={question}
                  onChange={(e) => {
                    setQuestion(e.target.value);
                    setQuestionEdited(true);
                  }}
                  className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none"
                />
              </div>

              <div className="mb-3">
                <div className="mb-1.5 text-center font-mono text-[10px] uppercase text-grayText">
                  How long should this battle run?
                </div>
                <div className="flex justify-center gap-2">
                  {DURATIONS.map((d) => (
                    <button
                      type="button"
                      key={d.value}
                      onClick={() => setDuration(d.value)}
                      aria-pressed={duration === d.value}
                      className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                        duration === d.value
                          ? "border-cornerA bg-cornerA text-white"
                          : "border-line bg-paper text-ink hover:border-cornerA"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={startBattle}
                disabled={!duration || creating}
                className="w-full rounded-lg bg-cornerA px-4 py-3 font-display text-xs uppercase tracking-wide text-white disabled:opacity-60"
              >
                {creating
                  ? "Starting…"
                  : duration
                  ? "Create Battle"
                  : "Pick a duration to start"}
              </button>
              {createError && (
                <div className="mt-2 text-center font-mono text-[10px] text-cornerA">
                  {createError}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// A single "pick a product" slot: pre-searches using the term parsed
// from the combined input, shows results with Select buttons, and offers
// `+ Add "{term}"` to create it inline if nothing matches. Search is
// typo-tolerant (see search_products() in supabase-schema.sql) so
// partial spelling and common misspellings still surface a match.
function ProductSlot({
  label,
  initialTerm,
  selectedProduct,
  onSelect,
  onClear,
  categories,
}) {
  const [query, setQuery] = useState(initialTerm || "");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [hasSearchedInitial, setHasSearchedInitial] = useState(false);
  const abortRef = useRef(null);

  async function runSearch(term) {
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

  useEffect(() => {
    if (!hasSearchedInitial && initialTerm) {
      setHasSearchedInitial(true);
      runSearch(initialTerm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTerm, hasSearchedInitial]);

  function handleQueryChange(term) {
    setQuery(term);
    runSearch(term);
  }

  function handleSelect(product) {
    try {
      onSelect(product);
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
        onChange={(e) => handleQueryChange(e.target.value)}
        placeholder="Search products…"
        className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none placeholder:text-grayText"
      />

      {searching && (
        <div className="mt-1 font-mono text-[10px] text-grayText">Searching…</div>
      )}
      {searchError && (
        <div className="mt-1 font-mono text-[10px] text-cornerA">{searchError}</div>
      )}

      {!searching && results.length > 0 && (
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

      {!searching && query.trim().length >= 2 && results.length === 0 && !searchError && (
        <div className="mt-1 font-mono text-[10px] text-grayText">
          No matches for "{query.trim()}".
        </div>
      )}

      {!showAddForm && (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="mt-2 font-mono text-[11px] font-bold text-cornerB"
        >
          + Add "{query.trim() || "this product"}"
        </button>
      )}

      {showAddForm && (
        <AddProductForm
          initialName={query.trim()}
          categories={categories}
          onCancel={() => setShowAddForm(false)}
          onCreated={handleSelect}
        />
      )}
    </div>
  );
}

// The inline "+ Add" mini form. Only name, website, and category are
// required — description and logo are optional and auto-filled from the
// website's Open Graph tags server-side if left blank. A manually
// entered description or uploaded logo always overrides auto-fetch.
function AddProductForm({ initialName, categories, onCancel, onCreated }) {
  const [name, setName] = useState(initialName || "");
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
    if (!name.trim() || !websiteUrl.trim() || !categoryId) {
      setStatus("error");
      setMessage("Product name, website, and category are required.");
      return;
    }

    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/submit-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          websiteUrl,
          categoryId,
          description: description.trim() || undefined,
          logoDataUrl: logoDataUrl || undefined,
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
          Add a product
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="font-mono text-[10px] text-grayText hover:text-cornerA"
        >
          Cancel
        </button>
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Product name"
        className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none placeholder:text-grayText"
      />

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
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {categories.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => toggleCategory(c.id)}
              aria-pressed={categoryId === c.id}
              className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
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

      <details className="rounded-lg border border-dashed border-line bg-paper px-3 py-2">
        <summary className="cursor-pointer font-mono text-[10px] uppercase text-grayText">
          Description &amp; logo (optional — we'll pull these from your
          site automatically if you skip them)
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <label className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-line bg-white text-[9px] text-grayText">
              {logoPreview ? (
                <img
                  src={logoPreview}
                  alt=""
                  className="h-full w-full object-cover"
                />
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
            <div className="font-mono text-[10px] text-grayText">
              Upload a PNG (≤2MB) to override the auto-fetched logo
            </div>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 280))}
            placeholder="Short description (leave blank to auto-fetch)"
            rows={2}
            maxLength={280}
            className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-grayText"
          />
        </div>
      </details>

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
