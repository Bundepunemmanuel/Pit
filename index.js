import { useState } from "react";
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
        "id, slug, votes_a, votes_b, status, product_a:product_a_id(id, name, slug), product_b:product_b_id(id, name, slug)"
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
      .select("id, name, slug, rating, wins, losses, category_id")
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

      {/* ---------- category bar (moved to the top, selectable pills — no popup/select) ---------- */}
      <CategoryBar
        categories={categories}
        activeCategorySlug={activeCategorySlug}
        onSelect={selectCategory}
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

      <SubmitSection categories={categories} />
    </div>
  );
}

// ---------- category bar ----------
// A row of clickable/tappable pills — deliberately NOT a native <select>
// or a modal/popup, per the "selectable, not pop up" requirement.
// Scrolls horizontally on narrow screens, wraps on wider ones.
function CategoryBar({ categories, activeCategorySlug, onSelect }) {
  if (!categories || categories.length === 0) return null;

  return (
    <section className="border-b border-line bg-ink/60 px-5 py-3 md:px-8">
      <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-pressed={!activeCategorySlug}
          className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-xs font-bold transition-colors ${
            !activeCategorySlug
              ? "border-cornerA bg-cornerA text-white"
              : "border-line bg-paperCard text-ink hover:border-cornerA"
          }`}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            type="button"
            key={c.id}
            onClick={() => onSelect(c.slug)}
            aria-pressed={activeCategorySlug === c.slug}
            className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-xs font-bold transition-colors ${
              activeCategorySlug === c.slug
                ? "border-cornerA bg-cornerA text-white"
                : "border-line bg-paperCard text-ink hover:border-cornerA"
            }`}
          >
            {c.icon} {c.name}
          </button>
        ))}
      </div>
    </section>
  );
}

// ---------- inline submit form ----------
// Kept in this file since it's only ever used on the homepage — no need
// for a separate component file for something with exactly one caller.
function SubmitSection({ categories }) {
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [message, setMessage] = useState("");

  function handleLogoChange(e) {
    try {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        setStatus("error");
        setMessage("Logo must be an image file.");
        logWarn("SubmitSection.handleLogoChange", "Rejected non-image file", {
          fileType: file.type,
        });
        return;
      }
      if (file.size > 1_000_000) {
        setStatus("error");
        setMessage("Logo must be smaller than 1MB.");
        logWarn("SubmitSection.handleLogoChange", "Rejected oversized file", {
          fileSize: file.size,
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        setLogoDataUrl(reader.result);
        setLogoPreview(reader.result);
      };
      reader.onerror = () => {
        const err = reader.error;
        logError("SubmitSection.handleLogoChange.FileReader", err);
        setStatus("error");
        setMessage("Couldn't read that image file. Try a different one.");
      };
      reader.readAsDataURL(file);
    } catch (err) {
      logError("SubmitSection.handleLogoChange", err);
      setStatus("error");
      setMessage("Something went wrong reading that file.");
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !identifier.trim()) {
      setStatus("error");
      setMessage("Product name and URL/@handle are required.");
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch("/api/submit-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          identifier,
          categoryId: categoryId || null,
          description,
          logoDataUrl,
        }),
      });

      const body = await res.json().catch((parseErr) => {
        logError("SubmitSection.handleSubmit.parseResponse", parseErr);
        return {};
      });

      if (!res.ok) {
        const err = new Error(body.error || "Submission failed");
        throw err;
      }

      setStatus("done");
      setMessage("Live on the leaderboard now.");
      setName("");
      setIdentifier("");
      setCategoryId("");
      setDescription("");
      setLogoDataUrl(null);
      setLogoPreview(null);
    } catch (err) {
      logError("SubmitSection.handleSubmit", err, {
        name,
        identifier,
        categoryId,
      });
      setStatus("error");
      setMessage(err.message || "Something went wrong. Please try again.");
    }
  }

  function toggleCategory(id) {
    try {
      setCategoryId((current) => (current === id ? "" : id));
    } catch (err) {
      logError("SubmitSection.toggleCategory", err, { id });
    }
  }

  const selectedCategory = categories.find((c) => c.id === categoryId);

  return (
    <section className="px-5 py-8 md:px-8">
      <h2 className="mb-3 font-display text-sm uppercase tracking-wide">
        Built something? Add it.
      </h2>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-xl border border-line bg-paperCard p-4 md:max-w-2xl"
      >
        <div className="flex items-center gap-3">
          <label className="flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-paper text-[10px] text-grayText">
            {logoPreview ? (
              <img src={logoPreview} alt="" className="h-full w-full object-cover" />
            ) : (
              "Logo"
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleLogoChange}
              className="hidden"
            />
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Product name"
            className="flex-1 rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none placeholder:text-grayText"
          />
        </div>

        <input
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="Your product URL or @handle"
          className="w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none placeholder:text-grayText"
        />

        {/* Category picker — selectable chips, not a native <select> popup. */}
        <div>
          <div className="mb-1.5 font-mono text-[10px] uppercase text-grayText">
            Category{selectedCategory ? ` — ${selectedCategory.name}` : " (optional)"}
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => toggleCategory(c.id)}
                aria-pressed={categoryId === c.id}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-bold transition-colors ${
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
            placeholder="One or two lines about what it does"
            rows={2}
            maxLength={MAX_DESCRIPTION_LENGTH}
            className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none placeholder:text-grayText"
          />
          <div className="mt-1 text-right font-mono text-[10px] text-grayText">
            {description.length}/{MAX_DESCRIPTION_LENGTH}
          </div>
        </div>

        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-lg bg-cornerB px-5 py-3 font-display text-xs uppercase tracking-wide text-white disabled:opacity-60"
        >
          {status === "loading" ? "Submitting…" : "Add Product"}
        </button>

        {message && (
          <div
            className={`font-mono text-[11px] ${
              status === "error" ? "text-cornerA" : "text-grayText"
            }`}
          >
            {message}
          </div>
        )}
      </form>
    </section>
  );
}
