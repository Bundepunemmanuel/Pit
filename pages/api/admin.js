import { supabaseAdmin } from "../../supabase-admin";
import { requireAdmin } from "../../lib/requireAdmin";
import { logError, logWarn } from "../../lib/logger";

// Every request here — GET or POST — must carry a valid, allowlisted
// Supabase session in the Authorization header ("Bearer <access_token>").
// This is the REAL gate: pages/emmybund.js hiding the UI behind a login
// screen is just convenience, not security — someone hitting this route
// directly without a valid admin session gets rejected here regardless.
//
// GET  ?action=products&q=search      -> product rows for the editor
// GET  ?action=battles&q=search       -> battle rows for the editor
// POST { type: "product-rating", productId, rating }
// POST { type: "battle-votes", battleId, votesA, votesB }

async function handleListProducts(req, res) {
  const { q } = req.query;
  try {
    let query = supabaseAdmin
      .from("products")
      .select("id, name, slug, rating, wins, losses, clicks, logo_url")
      .order("rating", { ascending: false })
      .limit(50);

    if (q && String(q).trim()) {
      query = query.ilike("name", `%${String(q).trim()}%`);
    }

    const { data, error } = await query;
    if (error) {
      logError("api/admin.listProducts", error, { q });
      return res.status(500).json({ error: "Could not load products" });
    }
    return res.status(200).json({ products: data ?? [] });
  } catch (err) {
    logError("api/admin.listProducts", err, { q });
    return res.status(500).json({ error: "Could not load products" });
  }
}

async function handleListBattles(req, res) {
  const { q } = req.query;
  try {
    let query = supabaseAdmin
      .from("battles")
      .select(
        "id, slug, status, votes_a, votes_b, clicks, question, product_a:product_a_id(id, name), product_b:product_b_id(id, name)"
      )
      .order("created_at", { ascending: false })
      .limit(50);

    const { data, error } = await query;
    if (error) {
      logError("api/admin.listBattles", error, { q });
      return res.status(500).json({ error: "Could not load battles" });
    }

    // Filter by product name client-side-of-the-query since it's a
    // joined column Supabase's ilike can't reach directly.
    const term = q && String(q).trim().toLowerCase();
    const battles = term
      ? (data ?? []).filter(
          (b) =>
            b.product_a?.name?.toLowerCase().includes(term) ||
            b.product_b?.name?.toLowerCase().includes(term)
        )
      : data ?? [];

    return res.status(200).json({ battles });
  } catch (err) {
    logError("api/admin.listBattles", err, { q });
    return res.status(500).json({ error: "Could not load battles" });
  }
}

async function handleUpdateProductRating(req, res, { email }) {
  const { productId, rating } = req.body || {};
  const parsedRating = Number(rating);

  if (!productId || !Number.isFinite(parsedRating)) {
    return res.status(400).json({ error: "productId and a numeric rating are required" });
  }
  if (parsedRating < 0) {
    return res.status(400).json({ error: "Rating can't go below 0" });
  }

  try {
    const { data: product, error: updateError } = await supabaseAdmin
      .from("products")
      .update({ rating: Math.round(parsedRating) })
      .eq("id", productId)
      .select("id, name, rating")
      .single();

    if (updateError) {
      logError("api/admin.updateProductRating", updateError, { productId, rating });
      return res.status(500).json({ error: "Could not update rating" });
    }

    // Log to rating_history too (battle_id null = manual admin
    // adjustment, not a vote outcome) so Form arrows / rating charts
    // reflect this change instead of silently drifting from it.
    const { error: historyError } = await supabaseAdmin.from("rating_history").insert({
      product_id: productId,
      battle_id: null,
      rating: Math.round(parsedRating),
    });
    if (historyError) {
      // Not fatal — the rating itself is already updated and returned.
      logError("api/admin.updateProductRating.history", historyError, {
        productId,
        rating,
        adminEmail: email,
      });
    }

    return res.status(200).json({ product });
  } catch (err) {
    logError("api/admin.updateProductRating", err, { productId, rating });
    return res.status(500).json({ error: "Could not update rating" });
  }
}

async function handleUpdateBattleVotes(req, res, { email }) {
  const { battleId, votesA, votesB } = req.body || {};
  const parsedA = Number(votesA);
  const parsedB = Number(votesB);

  if (!battleId || !Number.isFinite(parsedA) || !Number.isFinite(parsedB)) {
    return res
      .status(400)
      .json({ error: "battleId and numeric votesA/votesB are required" });
  }
  if (parsedA < 0 || parsedB < 0) {
    return res.status(400).json({ error: "Votes can't go below 0" });
  }

  try {
    const { data: battle, error: updateError } = await supabaseAdmin
      .from("battles")
      .update({ votes_a: Math.round(parsedA), votes_b: Math.round(parsedB) })
      .eq("id", battleId)
      .select("id, votes_a, votes_b")
      .single();

    if (updateError) {
      logError("api/admin.updateBattleVotes", updateError, { battleId, votesA, votesB });
      return res.status(500).json({ error: "Could not update votes" });
    }

    logWarn("api/admin.updateBattleVotes", "Manual vote edit", {
      battleId,
      votesA: parsedA,
      votesB: parsedB,
      adminEmail: email,
    });

    return res.status(200).json({ battle });
  } catch (err) {
    logError("api/admin.updateBattleVotes", err, { battleId, votesA, votesB });
    return res.status(500).json({ error: "Could not update votes" });
  }
}

export default async function handler(req, res) {
  const auth = await requireAdmin(req);
  if (!auth.authorized) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    if (req.method === "GET") {
      if (req.query.action === "battles") return handleListBattles(req, res);
      return handleListProducts(req, res);
    }

    if (req.method === "POST") {
      const { type } = req.body || {};
      if (type === "product-rating") return handleUpdateProductRating(req, res, auth);
      if (type === "battle-votes") return handleUpdateBattleVotes(req, res, auth);
      return res.status(400).json({ error: "Unknown update type" });
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    logError("api/admin", err, { method: req.method });
    return res.status(500).json({ error: "Something went wrong" });
  }
}
