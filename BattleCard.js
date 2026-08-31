import { useState } from "react";
import { logError, logWarn } from "./lib/logger";

// battle shape expected:
// {
//   id, slug, votes_a, votes_b,
//   product_a: { id, name, slug },
//   product_b: { id, name, slug },
// }
export default function BattleCard({ battle, live = true }) {
  const [votesA, setVotesA] = useState(battle?.votes_a ?? 0);
  const [votesB, setVotesB] = useState(battle?.votes_b ?? 0);
  const [voted, setVoted] = useState(false);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState(null);

  // Defensive guard: if a malformed battle object ever makes it this far,
  // fail loudly in the log with useful context instead of crashing render
  // with a cryptic "cannot read property of undefined".
  if (!battle || !battle.product_a || !battle.product_b) {
    logError("BattleCard.render", new Error("Malformed battle prop"), {
      battle,
    });
    return (
      <div className="mx-5 mb-6 rounded-2xl border border-line bg-inkCard px-4 py-6 text-center font-mono text-xs text-grayText">
        This battle couldn't be displayed.
      </div>
    );
  }

  const total = votesA + votesB;
  const pctA = total > 0 ? Math.round((votesA / total) * 100) : 50;
  const pctB = 100 - pctA;

  async function castVote(productId, side) {
    if (voted || voting) return;
    setVoting(true);
    setError(null);

    // Optimistic update
    if (side === "a") setVotesA((v) => v + 1);
    else setVotesB((v) => v + 1);

    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ battleId: battle.id, productId }),
      });

      if (!res.ok) {
        const body = await res.json().catch((parseErr) => {
          logWarn("BattleCard.castVote", "Vote error response was not JSON", {
            parseErr: parseErr?.message,
          });
          return {};
        });
        throw new Error(body.error || `Vote failed (${res.status})`);
      }

      setVoted(true);
    } catch (err) {
      // roll back the optimistic update
      if (side === "a") setVotesA((v) => v - 1);
      else setVotesB((v) => v - 1);
      logError("BattleCard.castVote", err, {
        battleId: battle.id,
        productId,
        side,
      });
      setError(err.message || "Vote failed. Please try again.");
    } finally {
      setVoting(false);
    }
  }

  return (
    <div className="mx-5 mb-6 md:mx-8">
      {live && (
        <div className="mb-2 flex items-center justify-center gap-2 font-mono text-[11px] font-bold tracking-wide text-cornerA md:justify-start">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cornerA" />
          LIVE BATTLE
        </div>
      )}

      <div className="mx-auto rounded-2xl border border-line bg-inkCard px-4 pt-5 md:max-w-xl">
        <div className="mb-3 flex justify-between font-mono text-[10px] font-bold tracking-wide">
          <span className="text-cornerA">RED CORNER</span>
          <span className="text-cornerB">BLUE CORNER</span>
        </div>

        <div className="flex items-start justify-between">
          <div className="flex w-[38%] flex-col items-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-cornerA bg-cornerADim font-display text-xl text-cornerA md:h-16 md:w-16">
              {battle.product_a.name[0]}
            </div>
            <div className="text-center text-sm font-bold md:text-base">
              {battle.product_a.name}
            </div>
          </div>

          <div className="mt-5 font-display text-sm text-grayText md:mt-6">VS</div>

          <div className="flex w-[38%] flex-col items-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-cornerB bg-cornerBDim font-display text-xl text-cornerB md:h-16 md:w-16">
              {battle.product_b.name[0]}
            </div>
            <div className="text-center text-sm font-bold md:text-base">
              {battle.product_b.name}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-between">
          <div className="w-[38%] text-center">
            <div className="font-mono text-2xl font-bold text-cornerA">
              {pctA}%
            </div>
          </div>
          <div className="w-[38%] text-center">
            <div className="font-mono text-2xl font-bold text-cornerB">
              {pctB}%
            </div>
          </div>
        </div>

        <div className="my-4 flex h-1.5 overflow-hidden rounded-full bg-line">
          <div className="bg-cornerA" style={{ width: `${pctA}%` }} />
          <div className="bg-cornerB" style={{ width: `${pctB}%` }} />
        </div>

        <div className="pb-4 text-center font-mono text-[10px] text-grayText">
          {total.toLocaleString()} VOTES
        </div>

        <div className="-mx-4 flex gap-px overflow-hidden rounded-b-2xl">
          <button
            disabled={voted || voting}
            onClick={() => castVote(battle.product_a.id, "a")}
            className="flex-1 bg-cornerA py-4 font-display text-xs uppercase tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Vote {battle.product_a.name}
          </button>
          <button
            disabled={voted || voting}
            onClick={() => castVote(battle.product_b.id, "b")}
            className="flex-1 bg-cornerB py-4 font-display text-xs uppercase tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Vote {battle.product_b.name}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-2 text-center font-mono text-[10px] text-cornerA">
          {error}
        </div>
      )}
      {voted && !error && (
        <div className="mt-2 text-center font-mono text-[10px] text-grayText">
          Vote counted. Thanks for weighing in.
        </div>
      )}
    </div>
  );
}
