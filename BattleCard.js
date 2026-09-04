import { useState } from "react";
import { logError, logWarn } from "./lib/logger";

// battle shape expected:
// {
//   id, slug, votes_a, votes_b, status, question, starts_at, ends_at,
//   views, winner_id,
//   product_a: { id, name, slug, logo_url },
//   product_b: { id, name, slug, logo_url },
// }

const EARLY_RESULT_THRESHOLD = 20; // below this many votes, flag result as early/unreliable

function formatTimeRemaining(endsAtIso) {
  if (!endsAtIso) return null;
  try {
    const diffMs = new Date(endsAtIso).getTime() - Date.now();
    if (diffMs <= 0) return null;
    const hours = Math.floor(diffMs / (60 * 60 * 1000));
    const days = Math.floor(hours / 24);
    if (days >= 1) return `Ends in ${days}d ${hours % 24}h`;
    if (hours >= 1) return `Ends in ${hours}h`;
    const minutes = Math.max(1, Math.floor(diffMs / (60 * 1000)));
    return `Ends in ${minutes}m`;
  } catch (err) {
    logError("BattleCard.formatTimeRemaining", err, { endsAtIso });
    return null;
  }
}

function formatEndedDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch (err) {
    logError("BattleCard.formatEndedDate", err, { iso });
    return null;
  }
}

export default function BattleCard({ battle }) {
  const [votesA, setVotesA] = useState(battle?.votes_a ?? 0);
  const [voted, setVoted] = useState(false);
  const [votedSide, setVotedSide] = useState(null); // "a" | "b" | null
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState(null);
  const [votesB, setVotesB] = useState(battle?.votes_b ?? 0);
  const [shareCopied, setShareCopied] = useState(false);

  // Defensive guard: if a malformed battle object ever makes it this far,
  // fail loudly in the log with useful context instead of crashing render
  // with a cryptic "cannot read property of undefined".
  if (!battle || !battle.product_a || !battle.product_b) {
    logError("BattleCard.render", new Error("Malformed battle prop"), {
      battle,
    });
    return (
      <div className="mx-5 mb-6 rounded-2xl border border-line bg-white px-4 py-6 text-center font-mono text-xs text-grayText">
        This battle couldn't be displayed.
      </div>
    );
  }

  const total = votesA + votesB;
  const pctA = total > 0 ? Math.round((votesA / total) * 100) : 50;
  const pctB = 100 - pctA;

  const hasEnded =
    battle.status !== "live" ||
    (battle.ends_at && new Date(battle.ends_at) <= new Date());
  const timeRemaining = !hasEnded ? formatTimeRemaining(battle.ends_at) : null;
  const endedDateLabel = hasEnded ? formatEndedDate(battle.ends_at) : null;
  const isEarlyResult = !hasEnded && total > 0 && total < EARLY_RESULT_THRESHOLD;

  const winnerProduct =
    battle.winner_id === battle.product_a.id
      ? battle.product_a
      : battle.winner_id === battle.product_b.id
      ? battle.product_b
      : null;

  async function castVote(productId, side) {
    if (voted || voting || hasEnded) return;
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
      setVotedSide(side);
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

  async function shareResult() {
    const url =
      typeof window !== "undefined" ? `${window.location.origin}/battle/${battle.slug}` : "";
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${battle.product_a.name} vs ${battle.product_b.name}`,
          text: battle.question || undefined,
          url,
        });
        return;
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }
    } catch (err) {
      if (err?.name !== "AbortError") {
        logError("BattleCard.shareResult", err, { battleId: battle.id });
      }
    }
  }

  return (
    <div className="mx-5 mb-6 md:mx-8">
      <div className="mx-auto rounded-2xl border border-line bg-white p-4 md:max-w-xl">
        {/* status row */}
        <div className="mb-4 flex items-center justify-between font-mono text-[11px] font-bold tracking-wide">
          {hasEnded ? (
            <span className="text-grayText">
              ENDED{endedDateLabel ? ` · ${endedDateLabel}` : ""}
            </span>
          ) : (
            <span className="flex items-center gap-2 text-cornerA">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cornerA" />
              LIVE BATTLE
              {isEarlyResult && <span className="text-grayText">· EARLY RESULT</span>}
              <span className="text-grayText">· {total.toLocaleString()} votes</span>
            </span>
          )}
          {hasEnded && (
            <span className="rounded-full border border-gold bg-paper px-3 py-1 text-[10px] text-ink">
              {winnerProduct ? `🏆 ${winnerProduct.name} wins` : "Tied — no winner"}
            </span>
          )}
        </div>

        {battle.question && (
          <div className="mb-4 text-center text-sm font-bold text-ink md:text-base">
            {battle.question}
          </div>
        )}

        {/* wide row: logo — percent — VS — percent — logo */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex flex-1 flex-col items-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-cornerA bg-cornerADim font-display text-xl text-cornerA md:h-16 md:w-16">
              {battle.product_a.logo_url ? (
                <img
                  src={battle.product_a.logo_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                battle.product_a.name[0]
              )}
            </div>
            <div className="text-center text-xs font-bold md:text-sm">
              {battle.product_a.name}
            </div>
          </div>

          <div className="flex flex-1 flex-col items-center">
            <div className="font-mono text-3xl font-bold text-cornerA md:text-4xl">{pctA}%</div>
            <div className="mt-1 font-mono text-[10px] text-grayText">
              {votesA.toLocaleString()} votes
            </div>
          </div>

          <div className="shrink-0 px-1 font-display text-sm text-grayText md:text-base">VS</div>

          <div className="flex flex-1 flex-col items-center">
            <div className="font-mono text-3xl font-bold text-cornerB md:text-4xl">{pctB}%</div>
            <div className="mt-1 font-mono text-[10px] text-grayText">
              {votesB.toLocaleString()} votes
            </div>
          </div>

          <div className="flex flex-1 flex-col items-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-cornerB bg-cornerBDim font-display text-xl text-cornerB md:h-16 md:w-16">
              {battle.product_b.logo_url ? (
                <img
                  src={battle.product_b.logo_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                battle.product_b.name[0]
              )}
            </div>
            <div className="text-center text-xs font-bold md:text-sm">
              {battle.product_b.name}
            </div>
          </div>
        </div>

        {total > 0 && (
          <div className="mt-3 text-center font-mono text-[10px] text-grayText">
            {total.toLocaleString()} people have already picked a side
          </div>
        )}

        <div className="my-4 flex h-1.5 overflow-hidden rounded-full bg-line">
          <div className="bg-cornerA" style={{ width: `${pctA}%` }} />
          <div className="bg-cornerB" style={{ width: `${pctB}%` }} />
        </div>

        {!hasEnded && (
          <div className="flex items-center gap-2">
            <button
              disabled={voted || voting}
              onClick={() => castVote(battle.product_a.id, "a")}
              className="flex-1 rounded-lg bg-cornerA py-3 font-display text-[11px] uppercase tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              Vote {battle.product_a.name} ⚡
            </button>
            {timeRemaining && (
              <span className="hidden shrink-0 font-mono text-[10px] text-grayText sm:block">
                {timeRemaining}
              </span>
            )}
            <button
              disabled={voted || voting}
              onClick={() => castVote(battle.product_b.id, "b")}
              className="flex-1 rounded-lg bg-cornerB py-3 font-display text-[11px] uppercase tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              Vote {battle.product_b.name} ⚡
            </button>
          </div>
        )}

        <div className="pt-3 text-center font-mono text-[10px] text-grayText">
          {timeRemaining && <span className="sm:hidden">{timeRemaining} · </span>}
          No signup required
        </div>
      </div>

      {error && (
        <div className="mt-2 text-center font-mono text-[10px] text-cornerA">{error}</div>
      )}

      {voted && !error && (
        <div className="mx-auto mt-3 rounded-2xl border border-line bg-paper p-4 md:max-w-xl">
          <div className="text-center text-sm font-bold text-ink">
            You voted for {votedSide === "a" ? battle.product_a.name : battle.product_b.name}
          </div>
          <div className="mt-1 text-center font-mono text-xs text-grayText">
            {pctA === pctB
              ? "It's currently tied"
              : `${pctA > pctB ? battle.product_a.name : battle.product_b.name} is winning ${Math.max(pctA, pctB)}%–${Math.min(pctA, pctB)}%`}
          </div>
          <div className="mt-1 text-center font-mono text-[10px] text-grayText">
            {total.toLocaleString()} people have voted
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`/api/click?battleId=${battle.id}&productId=${battle.product_a.id}`}
              className="flex-1 rounded-lg border border-line bg-white px-3 py-2 text-center font-mono text-[10px] font-bold text-ink hover:border-cornerA"
            >
              Visit {battle.product_a.name}
            </a>
            <button
              type="button"
              onClick={shareResult}
              className="flex-1 rounded-lg border border-line bg-white px-3 py-2 text-center font-mono text-[10px] font-bold text-ink hover:border-cornerA"
            >
              {shareCopied ? "Link copied" : "Share result"}
            </button>
            <a
              href={`/api/click?battleId=${battle.id}&productId=${battle.product_b.id}`}
              className="flex-1 rounded-lg border border-line bg-white px-3 py-2 text-center font-mono text-[10px] font-bold text-ink hover:border-cornerA"
            >
              Visit {battle.product_b.name}
            </a>
            <a
              href="/?panel=battle"
              className="flex-1 rounded-lg border border-cornerA bg-cornerA px-3 py-2 text-center font-mono text-[10px] font-bold text-white hover:opacity-90"
            >
              Challenge another
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
