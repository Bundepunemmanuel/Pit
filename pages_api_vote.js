import crypto from "crypto";
import { supabaseAdmin as supabase } from "../../supabase-admin";
import { calculateElo } from "../../elo";
import { generateBattleQuestion } from "../../lib/gemini";
import { logError, logWarn } from "../../lib/logger";

// Uses the service-role client on purpose — RLS blocks anon from writing
// to battles/products/votes, so only this server-side route (never the
// browser) can record a vote, create a battle, or move a rating.
//
// This file handles two things via the same POST route, dispatched by
// body.action:
//   (no action, or action omitted) -> cast a vote on an existing battle
//   action: "create"                -> create a new live battle between
//                                       two existing products (the "Start
//                                       a Battle" flow)

// MVP NOTE on voter identification (UPDATED — see below):
// This used to hash ONLY the requester's IP + battle id. That broke as
// soon as someone's IP changed (switching wifi<->cellular, a carrier
// rotating NAT addresses, etc.) — a network change silently reset their
// vote eligibility, which is a real integrity bug, not just a rough
// edge. Fixed by keying on a persistent anonymous cookie instead: the
// first request sets a random UUID in a long-lived cookie, and every
// subsequent request re-sends it. The dedup key is that cookie's value
// (never the IP). IP is still hashed and logged on every vote row (see
// ip_hash column) purely as a fraud-analysis SIGNAL for the admin
// dashboard — e.g. many different voter cookies all sharing one IP in a
// short window is worth flagging — but it is no longer part of the
// uniqueness check itself.
//
// This is still not bulletproof (clearing cookies / incognito bypasses
// it), but it's a large improvement over "any network change works",
// and matches what most lightweight anonymous-voting products do at
// this stage.
const VOTER_COOKIE_NAME = "zl_vid";
const VOTER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  });
  return out;
}

// Reads the existing zl_vid cookie, or mints and sets a new one. Returns
// the voter id either way, so the CALLER always has a stable id to hash
// against, whether this is a brand-new visitor or a returning one.
function getOrSetVoterId(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const existing = cookies[VOTER_COOKIE_NAME];
  if (existing && /^[a-f0-9-]{36}$/i.test(existing)) {
    return existing;
  }
  const fresh = crypto.randomUUID();
  res.setHeader(
    "Set-Cookie",
    `${VOTER_COOKIE_NAME}=${fresh}; Max-Age=${VOTER_COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`
  );
  return fresh;
}

function getVoterHash(voterId, battleId) {
  return crypto.createHash("sha256").update(`${voterId}:${battleId}`).digest("hex");
}

function getIpHash(req) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  return crypto.createHash("sha256").update(ip).digest("hex");
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

// Whitelist of allowed battle durations, in hours. NEVER accept an
// arbitrary duration or a client-sent end timestamp — a client could
// otherwise fake a far-future (never-ending) or already-past (instantly
// completable) battle. Only these three values are valid.
const ALLOWED_DURATION_HOURS = { "1h": 1, "24h": 24, "7d": 24 * 7 };

async function createBattle(req, res) {
  try {
    const { productAId, productBId, duration, question } = req.body || {};

    if (!productAId || !productBId) {
      logWarn("api/vote.createBattle", "Missing productAId or productBId", {
        productAId,
        productBId,
      });
      return res
        .status(400)
        .json({ error: "productAId and productBId are required" });
    }
    if (productAId === productBId) {
      logWarn("api/vote.createBattle", "Cannot battle a product against itself", {
        productAId,
      });
      return res.status(400).json({ error: "Pick two different products" });
    }

    const durationHours = ALLOWED_DURATION_HOURS[duration];
    if (!durationHours) {
      logWarn("api/vote.createBattle", "Invalid or missing duration", { duration });
      return res.status(400).json({
        error: "Pick how long the battle should last (1h, 24h, or 7d)",
      });
    }

    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id, name, slug, rating, description, category:category_id(name)")
      .in("id", [productAId, productBId])
      .eq("status", "active");

    if (productsError) {
      logError("api/vote.createBattle.fetchProducts", productsError, {
        productAId,
        productBId,
      });
      return res.status(500).json({ error: "Could not verify products" });
    }
    if (!products || products.length !== 2) {
      logWarn("api/vote.createBattle", "One or both products not found/active", {
        productAId,
        productBId,
        found: products?.length ?? 0,
      });
      return res
        .status(404)
        .json({ error: "One or both products couldn't be found" });
    }

    const productA = products.find((p) => p.id === productAId);
    const productB = products.find((p) => p.id === productBId);

    // The person can edit the default question, but never send a blank
    // one. If they didn't provide one, try Gemini for something specific
    // and grounded in what these products actually do — falling back to
    // the generic template on ANY failure (no API key set, timeout,
    // unusable response, etc.) so battle creation is never blocked on
    // this. See lib/gemini.js.
    let finalQuestion = question && question.trim();
    if (!finalQuestion) {
      const generated = await generateBattleQuestion({
        productAName: productA.name,
        productADescription: productA.description,
        productBName: productB.name,
        productBDescription: productB.description,
        categoryName: productA.category?.name || productB.category?.name,
      });
      finalQuestion = generated || `Which is better: ${productA.name} or ${productB.name}?`;
    }

    // NOTE: a 200-point rating-gap matchmaking cap used to be enforced
    // here (via isMatchAllowed in elo.js) — removed by request. Any two
    // active products can battle regardless of rating difference now.
    // isMatchAllowed/MAX_RATING_GAP are still exported from elo.js in
    // case this needs to come back.

    // Cooldown — block re-matching the same pairing UNDER THE SAME
    // QUESTION (in either product order) if they're already in a live
    // battle over it, or fought over it within the last 24h. Same two
    // products CAN run separate battles under different questions
    // ("best for coding" vs "best for writing") — that's intentional.
    const cooldownStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentBattles, error: recentError } = await supabase
      .from("battles")
      .select("id, slug, status, created_at")
      .or(
        `and(product_a_id.eq.${productAId},product_b_id.eq.${productBId}),and(product_a_id.eq.${productBId},product_b_id.eq.${productAId})`
      )
      .eq("question", finalQuestion)
      .or(`status.eq.live,created_at.gte.${cooldownStart}`)
      .order("created_at", { ascending: false })
      .limit(1);

    if (recentError) {
      logError("api/vote.createBattle.checkCooldown", recentError, {
        productAId,
        productBId,
      });
      return res.status(500).json({ error: "Could not verify battle history" });
    }
    if (recentBattles && recentBattles.length > 0) {
      const existing = recentBattles[0];
      logWarn("api/vote.createBattle", "Rematch blocked by cooldown", {
        productAId,
        productBId,
        existingBattleSlug: existing.slug,
        existingBattleStatus: existing.status,
      });
      return res.status(409).json({
        error:
          existing.status === "live"
            ? "These two already have a live battle — go vote on that one."
            : "These two just battled — they can rematch after a 24h cooldown.",
        existingBattleSlug: existing.slug,
      });
    }

    const baseSlug =
      slugify(`${productA.slug}-vs-${productB.slug}`) || `battle-${Date.now()}`;
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + durationHours * 60 * 60 * 1000);

    let insertResult = await supabase
      .from("battles")
      .insert({
        slug: baseSlug,
        product_a_id: productA.id,
        product_b_id: productB.id,
        status: "live",
        question: finalQuestion,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        created_by: "user",
      })
      .select("id, slug")
      .single();

    if (insertResult.error?.code === "23505") {
      // This exact pairing has battled before (slug collision) — retry
      // once with a short unique suffix rather than failing outright.
      const retrySlug = `${baseSlug}-${Date.now().toString(36)}`;
      insertResult = await supabase
        .from("battles")
        .insert({
          slug: retrySlug,
          product_a_id: productA.id,
          product_b_id: productB.id,
          status: "live",
          question: finalQuestion,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          created_by: "user",
        })
        .select("id, slug")
        .single();
    }

    if (insertResult.error) {
      logError("api/vote.createBattle.insert", insertResult.error, {
        productAId,
        productBId,
        baseSlug,
      });
      return res.status(500).json({ error: "Could not create battle" });
    }

    return res.status(200).json({ battle: insertResult.data });
  } catch (err) {
    logError("api/vote.createBattle", err, { body: req.body });
    return res
      .status(500)
      .json({ error: "Something went wrong creating the battle" });
  }
}

async function castVote(req, res) {
  try {
    const { battleId, productId } = req.body || {};
    if (!battleId || !productId) {
      logWarn("api/vote.castVote", "Missing battleId or productId", {
        battleId,
        productId,
      });
      return res
        .status(400)
        .json({ error: "battleId and productId are required" });
    }

    // 1. Verify the battle exists and is live.
    const { data: battle, error: battleError } = await supabase
      .from("battles")
      .select(
        "id, status, votes_a, votes_b, votes_a_boost, votes_b_boost, ends_at, product_a_id, product_b_id, product_a:product_a_id(id, rating), product_b:product_b_id(id, rating)"
      )
      .eq("id", battleId)
      .single();

    if (battleError || !battle) {
      if (battleError) {
        logError("api/vote.castVote.fetchBattle", battleError, { battleId });
      } else {
        logWarn("api/vote.castVote", "Battle not found", { battleId });
      }
      return res.status(404).json({ error: "Battle not found" });
    }

    // Lazily expire this battle if its time is up, even if a stale
    // "live" status is still sitting on the row.
    if (battle.ends_at && new Date(battle.ends_at) <= new Date()) {
      const winnerId =
        battle.votes_a === battle.votes_b
          ? null
          : battle.votes_a > battle.votes_b
          ? battle.product_a_id
          : battle.product_b_id;
      const { error: closeError } = await supabase
        .from("battles")
        .update({ status: "completed", winner_id: winnerId })
        .eq("id", battleId);
      if (closeError) {
        logError("api/vote.castVote.autoClose", closeError, { battleId });
      }
      logWarn("api/vote.castVote", "Vote rejected: battle time is up", {
        battleId,
        endsAt: battle.ends_at,
      });
      return res.status(400).json({ error: "This battle has ended" });
    }

    if (battle.status !== "live") {
      logWarn("api/vote.castVote", "Vote rejected: battle not live", {
        battleId,
        status: battle.status,
      });
      return res.status(400).json({ error: "This battle isn't live" });
    }

    const isA = productId === battle.product_a_id;
    const isB = productId === battle.product_b_id;
    if (!isA && !isB) {
      logWarn("api/vote.castVote", "productId not part of this battle", {
        battleId,
        productId,
      });
      return res.status(400).json({ error: "productId is not in this battle" });
    }

    // 2. Identify voter, check for a duplicate vote (1 vote per browser
    // per battle, via a persistent cookie — see getOrSetVoterId above).
    const voterId = getOrSetVoterId(req, res);
    const voterHash = getVoterHash(voterId, battleId);
    const ipHash = getIpHash(req);

    const { error: voteInsertError } = await supabase.from("votes").insert({
      battle_id: battleId,
      product_id: productId,
      voter_hash: voterHash,
      ip_hash: ipHash,
    });

    if (voteInsertError) {
      // Unique constraint violation = already voted on this battle.
      if (voteInsertError.code === "23505") {
        logWarn("api/vote.castVote", "Duplicate vote rejected", {
          battleId,
          voterHash,
        });
        return res.status(409).json({ error: "You already voted on this battle" });
      }
      logError("api/vote.castVote.insertVote", voteInsertError, {
        battleId,
        productId,
      });
      return res.status(500).json({ error: "Could not record vote" });
    }

    // 3. Update the cached vote counts on the battle.
    const newVotesA = battle.votes_a + (isA ? 1 : 0);
    const newVotesB = battle.votes_b + (isB ? 1 : 0);

    const { error: battleUpdateError } = await supabase
      .from("battles")
      .update({ votes_a: newVotesA, votes_b: newVotesB })
      .eq("id", battleId);

    if (battleUpdateError) {
      // The vote itself is already recorded, so don't fail the request —
      // but this needs to be visible, because the cached count is now
      // stale until someone investigates.
      logError("api/vote.castVote.updateBattleCounts", battleUpdateError, {
        battleId,
        newVotesA,
        newVotesB,
      });
    }

    // 4. Move ratings using dynamic Elo (see elo.js).
    const { newRatingA, newRatingB } = calculateElo(
      battle.product_a.rating,
      battle.product_b.rating,
      isA ? 1 : 0
    );

    const { error: ratingAError } = await supabase
      .from("products")
      .update({ rating: newRatingA })
      .eq("id", battle.product_a_id);

    if (ratingAError) {
      logError("api/vote.castVote.updateRatingA", ratingAError, {
        productId: battle.product_a_id,
        newRatingA,
      });
    } else {
      const { error: historyAError } = await supabase.from("rating_history").insert({
        product_id: battle.product_a_id,
        battle_id: battleId,
        rating: newRatingA,
      });
      if (historyAError) {
        // Non-fatal — Form/confidence just won't reflect this one data
        // point, but the rating itself is already correctly saved.
        logError("api/vote.castVote.logHistoryA", historyAError, {
          productId: battle.product_a_id,
        });
      }
    }

    const { error: ratingBError } = await supabase
      .from("products")
      .update({ rating: newRatingB })
      .eq("id", battle.product_b_id);

    if (ratingBError) {
      logError("api/vote.castVote.updateRatingB", ratingBError, {
        productId: battle.product_b_id,
        newRatingB,
      });
    } else {
      const { error: historyBError } = await supabase.from("rating_history").insert({
        product_id: battle.product_b_id,
        battle_id: battleId,
        rating: newRatingB,
      });
      if (historyBError) {
        logError("api/vote.castVote.logHistoryB", historyBError, {
          productId: battle.product_b_id,
        });
      }
    }

    const total = newVotesA + newVotesB;
    const boostA = battle.votes_a_boost ?? 0;
    const boostB = battle.votes_b_boost ?? 0;
    const displayVotesA = newVotesA + boostA;
    const displayVotesB = newVotesB + boostB;
    const displayTotal = displayVotesA + displayVotesB;
    return res.status(200).json({
      votesA: displayVotesA,
      votesB: displayVotesB,
      pctA: displayTotal > 0 ? Math.round((displayVotesA / displayTotal) * 100) : 50,
      pctB: displayTotal > 0 ? Math.round((displayVotesB / displayTotal) * 100) : 50,
    });
  } catch (err) {
    logError("api/vote.castVote", err, { body: req.body });
    return res
      .status(500)
      .json({ error: "Something went wrong recording your vote" });
  }
}

export default async function handler(req, res) {
  // The whole handler is wrapped so any unexpected exception (a bad env
  // var, a Supabase client throwing instead of returning an error object,
  // a network failure) still gets logged with full context and returns a
  // clean 500 — instead of Next.js printing an unhelpful generic crash.
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", ["POST"]);
      logWarn("api/vote", "Rejected non-POST request", { method: req.method });
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { action } = req.body || {};
    if (action === "create") {
      return createBattle(req, res);
    }
    return castVote(req, res);
  } catch (err) {
    logError("api/vote", err, { body: req.body });
    return res.status(500).json({ error: "Something went wrong" });
  }
}
