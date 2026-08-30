import crypto from "crypto";
import { supabase } from "../../supabase";
import { calculateElo } from "../../elo";

// MVP NOTE on voter identification:
// This hashes the requester's IP + battle id to build a one-vote-per-battle
// key. That's intentionally simple for the MVP and is NOT sufficient
// fraud prevention on its own (people can switch IPs). Doc 1 flags this
// directly — the real version should combine an anonymous cookie ID with
// this IP hash, then layer in rate limiting and duplicate-fingerprint
// detection once the platform has real traffic worth protecting.
function getVoterHash(req, battleId) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  return crypto.createHash("sha256").update(`${ip}:${battleId}`).digest("hex");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { battleId, productId } = req.body || {};
  if (!battleId || !productId) {
    return res.status(400).json({ error: "battleId and productId are required" });
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
    return res.status(404).json({ error: "Battle not found" });
  }
  if (battle.status !== "live") {
    return res.status(400).json({ error: "This battle isn't live" });
  }

  const isA = productId === battle.product_a_id;
  const isB = productId === battle.product_b_id;
  if (!isA && !isB) {
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
      return res.status(409).json({ error: "You already voted on this battle" });
    }
    return res.status(500).json({ error: "Could not record vote" });
  }

  // 3. Update the cached vote counts on the battle.
  const newVotesA = battle.votes_a + (isA ? 1 : 0);
  const newVotesB = battle.votes_b + (isB ? 1 : 0);

  await supabase
    .from("battles")
    .update({ votes_a: newVotesA, votes_b: newVotesB })
    .eq("id", battleId);

  // 4. Nudge ELO ratings (see elo.js for why this is per-vote for the MVP).
  const { newRatingA, newRatingB } = calculateElo(
    battle.product_a.rating,
    battle.product_b.rating,
    isA ? 1 : 0
  );

  await supabase
    .from("products")
    .update({ rating: newRatingA })
    .eq("id", battle.product_a_id);

  await supabase
    .from("products")
    .update({ rating: newRatingB })
    .eq("id", battle.product_b_id);

  const total = newVotesA + newVotesB;
  return res.status(200).json({
    votesA: newVotesA,
    votesB: newVotesB,
    pctA: total > 0 ? Math.round((newVotesA / total) * 100) : 50,
    pctB: total > 0 ? Math.round((newVotesB / total) * 100) : 50,
  });
}
