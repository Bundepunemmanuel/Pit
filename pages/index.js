import { useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../supabase";
import BattleCard from "../BattleCard";
import LeaderboardTable from "../LeaderboardTable";
import Link from "next/link";

const MAX_DESCRIPTION_LENGTH = 280;

export async function getServerSideProps({ query }) {
  const { data: battles } = await supabase
    .from("battles")
    .select(
      "id, slug, votes_a, votes_b, status, product_a:product_a_id(id, name, slug), product_b:product_b_id(id, name, slug)"
    )
    .eq("status", "live")
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name, slug, icon")
    .order("name", { ascending: true });

  // Category filter applies to the leaderboard only — a battle pairs two
  // products that can each belong to a different category, so filtering
  // "which battles show" by a single category doesn't map cleanly.
  const activeCategorySlug = query.category || null;
  const activeCategory = categories?.find((c) => c.slug === activeCategorySlug);

  let productsQuery = supabase
    .from("products")
    .select("id, name, slug, rating, wins, losses, category_id")
    .eq("status", "active")
    .order("rating", { ascending: false })
    .limit(10);

  if (activeCategory) {
    productsQuery = productsQuery.eq("category_id", activeCategory.id);
  }

  const { data: products } = await productsQuery;

  return {
    props: {
      liveBattle: battles?.[0] ?? null,
      trending: battles?.slice(1) ?? [],
      products: products ?? [],
      categories: categories ?? [],
      activeCategorySlug: activeCategorySlug ?? null,
    },
  };
}

export default function Home({
  liveBattle,
  trending,
  products,
  categories,
  activeCategorySlug,
}) {
  const router = useRouter();

  function selectCategory(slug) {
    router.push(slug ? { pathname: "/", query: { category: slug } } : "/");
  }

  return (
    <div className="mx-auto max-w-5xl pb-12">
      <section className="px-5 pt-7 pb-2 text-center md:px-8 md:text-left">
        <h1 className="font-display text-3xl uppercase leading-none tracking-wide md:text-5xl">
          The internet
          <br />
          picks the winner.
        </h1>
        <p className="mt-3 text-sm text-grayText">
          Vote in real product battles. No signup required.
        </p>
      </section>

      {/* ---------- category filter ---------- */}
      <section className="px-5 py-5 md:px-8">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => selectCategory(null)}
            className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-xs font-bold ${
              !activeCategorySlug
                ? "border-cornerA bg-cornerA text-white"
                : "border-line bg-paperCard text-ink"
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => selectCategory(c.slug)}
              className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-xs font-bold ${
                activeCategorySlug === c.slug
                  ? "border-cornerA bg-cornerA text-white"
                  : "border-line bg-paperCard text-ink"
              }`}
            >
              {c.icon} {c.name}
            </button>
          ))}
        </div>
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
          <div className="md:grid md:grid-cols-2 md:gap-x-10">
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
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setStatus("error");
      setMessage("Logo must be an image file.");
      return;
    }
    if (file.size > 1_000_000) {
      setStatus("error");
      setMessage("Logo must be smaller than 1MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setLogoDataUrl(reader.result);
      setLogoPreview(reader.result);
    };
    reader.readAsDataURL(file);
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

      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Submission failed");

      setStatus("done");
      setMessage("Live on the leaderboard now.");
      setName("");
      setIdentifier("");
      setCategoryId("");
      setDescription("");
      setLogoDataUrl(null);
      setLogoPreview(null);
    } catch (err) {
      setStatus("error");
      setMessage(err.message);
    }
  }

  return (
    <section className="px-5 py-8 md:px-8">
      <h2 className="mb-3 font-display text-sm uppercase tracking-wide">
        Built something? Add it.
      </h2>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-xl border border-line bg-paperCard p-4"
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

        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Your product URL or @handle"
            className="flex-1 rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none placeholder:text-grayText"
          />
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink sm:w-48"
          >
            <option value="">Choose a category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
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
