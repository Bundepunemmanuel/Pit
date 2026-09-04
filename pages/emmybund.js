import { useEffect, useState } from "react";
import Head from "next/head";
import { supabase } from "../supabase";
import { logError, logWarn } from "../lib/logger";

// Deliberately NOT linked from Header.js, the footer, or anywhere else
// in the UI — this route is only reachable by typing/bookmarking it
// directly. `noindex, nofollow` below keeps it out of search engines
// too. Neither of those is real security on its own (an unguessable URL
// can still leak); the actual gate is the Supabase login + email
// allowlist enforced server-side in pages/api/admin.js via
// lib/requireAdmin.js — this page re-checks the same way so the UI
// never shows admin data it can't also legitimately fetch.

async function authedFetch(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return fetch(path, { ...options, headers });
}

function LoginForm({ onSignedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      onSignedIn(data.session);
    } catch (err) {
      logWarn("emmybund.LoginForm", "Sign-in failed", { error: err?.message });
      setStatus("error");
      setError("Couldn't sign in — check your email and password.");
    }
  }

  return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <h1 className="font-display text-xl uppercase tracking-wide">Admin</h1>
      <p className="mt-1 font-mono text-xs text-grayText">Sign in to continue.</p>
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="username"
          className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none placeholder:text-grayText"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none placeholder:text-grayText"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-lg bg-ink px-4 py-2.5 font-display text-[11px] uppercase tracking-wide text-white disabled:opacity-60"
        >
          {status === "loading" ? "Signing in…" : "Sign in"}
        </button>
        {error && <div className="font-mono text-[10px] text-cornerA">{error}</div>}
      </form>
    </div>
  );
}

function ProductsEditor() {
  const [q, setQ] = useState("");
  const [products, setProducts] = useState([]);
  const [drafts, setDrafts] = useState({}); // productId -> draft rating string
  const [savingId, setSavingId] = useState(null);
  const [loadError, setLoadError] = useState(null);

  async function load() {
    try {
      const res = await authedFetch(`/api/admin?action=products&q=${encodeURIComponent(q)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load products");
      setProducts(body.products || []);
      setLoadError(null);
    } catch (err) {
      logError("emmybund.ProductsEditor.load", err, { q });
      setLoadError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveRating(productId) {
    const draft = drafts[productId];
    if (draft === undefined || draft === "") return;
    setSavingId(productId);
    try {
      const res = await authedFetch("/api/admin", {
        method: "POST",
        body: JSON.stringify({ type: "product-rating", productId, rating: draft }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Save failed");
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, rating: body.product.rating } : p))
      );
    } catch (err) {
      logError("emmybund.ProductsEditor.saveRating", err, { productId, draft });
      setLoadError(err.message);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Search products…"
          className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none placeholder:text-grayText"
        />
        <button
          onClick={load}
          className="shrink-0 rounded-lg border border-line bg-white px-3 py-2 text-xs font-bold hover:border-cornerA"
        >
          Search
        </button>
      </div>

      {loadError && (
        <div className="mt-3 font-mono text-[10px] text-cornerA">{loadError}</div>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {products.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-lg border border-line bg-white px-3 py-2.5"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-paper font-display text-xs">
              {p.logo_url ? (
                <img src={p.logo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                p.name[0]
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{p.name}</div>
              <div className="font-mono text-[10px] text-grayText">
                {(p.wins ?? 0)}W – {(p.losses ?? 0)}L · {(p.clicks ?? 0).toLocaleString()} clicks
              </div>
            </div>
            <input
              type="number"
              value={drafts[p.id] ?? p.rating ?? 0}
              onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
              className="w-20 rounded-lg border border-line bg-paper px-2 py-1.5 text-right font-mono text-sm outline-none"
            />
            <button
              onClick={() => saveRating(p.id)}
              disabled={savingId === p.id}
              className="shrink-0 rounded-lg bg-cornerB px-3 py-1.5 font-mono text-[10px] font-bold text-white disabled:opacity-60"
            >
              {savingId === p.id ? "Saving…" : "Save"}
            </button>
          </div>
        ))}
        {products.length === 0 && !loadError && (
          <p className="py-6 text-center font-mono text-xs text-grayText">No products found.</p>
        )}
      </div>
    </div>
  );
}

function BattlesEditor() {
  const [battles, setBattles] = useState([]);
  const [drafts, setDrafts] = useState({}); // battleId -> { votesA, votesB } draft strings
  const [savingId, setSavingId] = useState(null);
  const [loadError, setLoadError] = useState(null);

  async function load() {
    try {
      const res = await authedFetch("/api/admin?action=battles");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load battles");
      setBattles(body.battles || []);
      setLoadError(null);
    } catch (err) {
      logError("emmybund.BattlesEditor.load", err);
      setLoadError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveVotes(battleId) {
    const battle = battles.find((b) => b.id === battleId);
    const draft = drafts[battleId] || {};
    const votesA = draft.votesA ?? battle?.votes_a ?? 0;
    const votesB = draft.votesB ?? battle?.votes_b ?? 0;

    setSavingId(battleId);
    try {
      const res = await authedFetch("/api/admin", {
        method: "POST",
        body: JSON.stringify({ type: "battle-votes", battleId, votesA, votesB }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Save failed");
      setBattles((prev) =>
        prev.map((b) =>
          b.id === battleId
            ? { ...b, votes_a: body.battle.votes_a, votes_b: body.battle.votes_b }
            : b
        )
      );
    } catch (err) {
      logError("emmybund.BattlesEditor.saveVotes", err, { battleId, draft });
      setLoadError(err.message);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div>
      {loadError && (
        <div className="mb-3 font-mono text-[10px] text-cornerA">{loadError}</div>
      )}
      <div className="flex flex-col gap-2">
        {battles.map((b) => {
          const draft = drafts[b.id] || {};
          return (
            <div key={b.id} className="rounded-lg border border-line bg-white px-3 py-2.5">
              <div className="truncate text-sm font-bold">
                {b.product_a?.name} <span className="font-normal text-grayText">vs</span>{" "}
                {b.product_b?.name}
              </div>
              {b.question && (
                <div className="mt-0.5 font-mono text-[10px] text-grayText">{b.question}</div>
              )}
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  value={draft.votesA ?? b.votes_a ?? 0}
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [b.id]: { ...d[b.id], votesA: e.target.value },
                    }))
                  }
                  className="w-20 rounded-lg border border-line bg-paper px-2 py-1.5 text-right font-mono text-sm outline-none"
                />
                <span className="font-mono text-[10px] text-grayText">votes A</span>
                <input
                  type="number"
                  value={draft.votesB ?? b.votes_b ?? 0}
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [b.id]: { ...d[b.id], votesB: e.target.value },
                    }))
                  }
                  className="w-20 rounded-lg border border-line bg-paper px-2 py-1.5 text-right font-mono text-sm outline-none"
                />
                <span className="font-mono text-[10px] text-grayText">votes B</span>
                <button
                  onClick={() => saveVotes(b.id)}
                  disabled={savingId === b.id}
                  className="ml-auto shrink-0 rounded-lg bg-cornerB px-3 py-1.5 font-mono text-[10px] font-bold text-white disabled:opacity-60"
                >
                  {savingId === b.id ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          );
        })}
        {battles.length === 0 && !loadError && (
          <p className="py-6 text-center font-mono text-xs text-grayText">No battles found.</p>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out
  const [tab, setTab] = useState("products");
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUnauthorized(false);
    });
    return () => listener?.subscription?.unsubscribe();
  }, []);

  // Even after a successful Supabase login, confirm the email is
  // actually on the server-side allowlist before showing anything —
  // catches "valid account, wrong person" immediately instead of
  // showing an empty/erroring dashboard.
  useEffect(() => {
    if (!session) return;
    authedFetch("/api/admin?action=products")
      .then((res) => {
        if (res.status === 403) {
          setUnauthorized(true);
          supabase.auth.signOut();
        }
      })
      .catch((err) => logError("emmybund.checkAuthorized", err));
  }, [session]);

  return (
    <>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Admin</title>
      </Head>
      <div className="mx-auto max-w-2xl px-5 pb-16">
        {session === undefined ? null : !session ? (
          <LoginForm onSignedIn={setSession} />
        ) : unauthorized ? (
          <div className="mx-auto max-w-sm py-16 text-center">
            <h1 className="font-display text-xl uppercase tracking-wide">Not authorized</h1>
            <p className="mt-2 font-mono text-xs text-grayText">
              This account isn't on the admin list.
            </p>
          </div>
        ) : (
          <div className="pt-8">
            <div className="flex items-center justify-between">
              <h1 className="font-display text-xl uppercase tracking-wide">Admin</h1>
              <button
                onClick={() => supabase.auth.signOut()}
                className="font-mono text-[10px] text-grayText hover:text-cornerA"
              >
                Sign out
              </button>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setTab("products")}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                  tab === "products"
                    ? "border-cornerA bg-cornerA text-white"
                    : "border-line bg-white text-ink"
                }`}
              >
                Products
              </button>
              <button
                onClick={() => setTab("battles")}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                  tab === "battles"
                    ? "border-cornerA bg-cornerA text-white"
                    : "border-line bg-white text-ink"
                }`}
              >
                Battles
              </button>
            </div>

            <div className="mt-4">
              {tab === "products" ? <ProductsEditor /> : <BattlesEditor />}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
