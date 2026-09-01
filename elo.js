// Rating logic.
//
// NOTE: despite the filename (kept as-is to avoid re-shuffling every
// import across the app), this is NOT the Elo rating system anymore.
// It's a flat-delta scoring system: every win is worth the same points
// regardless of who you beat, every loss costs the same regardless of
// who beat you. Simpler to reason about than Elo's dynamic K-factor math,
// at the cost of not rewarding upsets more than expected wins.
//
// Rules:
//   - New products start at 1000 rating (set in supabase-schema.sql's
//     default for the `rating` column — this file doesn't set the
//     starting value, only the change per result).
//   - Winner gains WIN_DELTA points.
//   - Loser loses LOSS_DELTA points, floored at MIN_RATING (never negative).
//   - Two products can only battle if their ratings are within
//     MAX_RATING_GAP of each other — stops a brand-new product from
//     farming free wins off a long-established leader, and vice versa.

export const STARTING_RATING = 1000;
export const WIN_DELTA = 64;
export const LOSS_DELTA = 64;
export const MIN_RATING = 0;
export const MAX_RATING_GAP = 200;

/**
 * Compute the new ratings after a result.
 * @param {number} ratingA - product A's rating before this result
 * @param {number} ratingB - product B's rating before this result
 * @param {0 | 1} scoreA - 1 if product A won, 0 if product B won
 */
export function calculateRatingChange(ratingA, ratingB, scoreA) {
  for (const [label, value] of [
    ["ratingA", ratingA],
    ["ratingB", ratingB],
    ["scoreA", scoreA],
  ]) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new Error(
        `calculateRatingChange: ${label} must be a number, received ${JSON.stringify(value)}`
      );
    }
  }
  if (scoreA !== 0 && scoreA !== 1) {
    throw new Error(
      `calculateRatingChange: scoreA must be 0 or 1, received ${scoreA}`
    );
  }

  const aWon = scoreA === 1;
  const newRatingA = Math.max(
    MIN_RATING,
    aWon ? ratingA + WIN_DELTA : ratingA - LOSS_DELTA
  );
  const newRatingB = Math.max(
    MIN_RATING,
    aWon ? ratingB - LOSS_DELTA : ratingB + WIN_DELTA
  );

  return { newRatingA, newRatingB };
}

/**
 * Whether two products are allowed to battle, based on the rating-gap cap.
 * Keeps a much stronger product from being challenged by a much weaker
 * one (or farming easy wins off one).
 */
export function isMatchAllowed(ratingA, ratingB) {
  if (typeof ratingA !== "number" || typeof ratingB !== "number") {
    throw new Error("isMatchAllowed: both ratings must be numbers");
  }
  return Math.abs(ratingA - ratingB) <= MAX_RATING_GAP;
}
