import crypto from "crypto";
import { supabaseAdmin as supabase } from "../../supabase-admin";
import { calculateElo } from "../../elo";
import { logError, logWarn } from "../../lib/logger";

// Uses the service-role client on purpose — RLS blocks anon from writing
// to battles/products/votes, so only this server-side route (never the
// browser) can record a vote or move a rating.

// MVP NOTE on voter identification:
// This hashes the requester's IP + battle id to build a one-vote-per-battle
// key. That's intentionally simple for the MVP and is NOT sufficient
// fraud prevention on its own (people can switch IPs). The real version
// should combine an anonymous cookie ID with this IP hash, then layer in
// rate limiting and duplicate-fingerprint detection.
function getVoterHash(req, battleId) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  return crypto.createHash("sha256").update(`${ip}:${battleId}`).digest("hex");
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

    const { battleId, productId } = req.body || {};
    if (!battleId || !productId) {
      logWarn("api/vote", "Missing battleId or productId", {
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
        "id, status, votes_a, votes_b, product_a_id, product_b_id, product_a:product_a_id(id, rating), product_b:product_b_id(id, rating)"
      )
      .eq("id", battleId)
      .single();

    if (battleError || !battle) {
      if (battleError) {
        logError("api/vote.fetchBattle", battleError, { battleId });
      } else {
        logWarn("api/vote", "Battle not found", { battleId });
      }
      return res.status(404).json({ error: "Battle not found" });
    }
    if (battle.status !== "live") {
      logWarn("api/vote", "Vote rejected: battle not live", {
        battleId,
        status: battle.status,
      });
      return res.status(400).json({ error: "This battle isn't live" });
    }

    const isA = productId === battle.product_a_id;
    const isB = productId === battle.product_b_id;
    if (!isA && !isB) {
      logWarn("api/vote", "productId not part of this battle", {
        battleId,
        productId,
      });
      return res.status(400).json({ error: "productId is not in this battle" });
    }

    // 2. Identify voter, check for a duplicate vote.
    const voterHash = getVoterHash(req, battleId);

    const { error: voteInsertError } = await supabase.from("votes").insert({
      battle_id: battleId,
      product_id: productId,
      voter_hash: voterHash,
    });

    if (voteInsertError) {
      // Unique constraint violation = already voted on this battle.
      if (voteInsertError.code === "23505") {
        logWarn("api/vote", "Duplicate vote rejected", { battleId, voterHash });
        return res.status(409).json({ error: "You already voted on this battle" });
      }
      logError("api/vote.insertVote", voteInsertError, { battleId, productId });
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
      logError("api/vote.updateBattleCounts", battleUpdateError, {
        battleId,
        newVotesA,
        newVotesB,
      });
    }

    // 4. Nudge ELO ratings (see elo.js for why this is per-vote for the MVP).
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
      logError("api/vote.updateRatingA", ratingAError, {
        productId: battle.product_a_id,
        newRatingA,
      });
    }

    const { error: ratingBError } = await supabase
      .from("products")
      .update({ rating: newRatingB })
      .eq("id", battle.product_b_id);

    if (ratingBError) {
      logError("api/vote.updateRatingB", ratingBError, {
        productId: battle.product_b_id,
        newRatingB,
      });
    }

    const total = newVotesA + newVotesB;
    return res.status(200).json({
      votesA: newVotesA,
      votesB: newVotesB,
      pctA: total > 0 ? Math.round((newVotesA / total) * 100) : 50,
      pctB: total > 0 ? Math.round((newVotesB / total) * 100) : 50,
    });
  } catch (err) {
    logError("api/vote", err, { body: req.body });
    return res.status(500).json({ error: "Something went wrong recording your vote" });
  }
}
