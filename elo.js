// Rating logic — dynamic Elo (reverted from a brief flat-delta experiment
// earlier in this project's history; keeping that context here in case
// anyone wonders why the git history has both).
//
// Classic Elo: a win against a stronger opponent moves your rating more
// than a win against a weaker one, and vice versa for losses. The K
// factor controls how big a single result can move a rating.
//
// MVP NOTE: ratings update per individual VOTE, not once per completed
// battle — each vote is treated as its own tiny "match" between the two
// products. That's why K is kept small (4) by default: a battle can
// accumulate hundreds or thousands of votes, and a large K per vote
// would make ratings swing wildly. A production version might instead
// batch the rating update once when a battle completes.
//
// New products start at 1000 (set via the `rating` column's default in
// supabase-schema.sql, not by this file). Existing products from before
// that change keep whatever rating they already had.

export const STARTING_RATING = 1000;
export const MIN_RATING = 0;
export const MAX_RATING_GAP = 200;

/**
 * Compute the new ratings after a single vote, using dynamic Elo.
 * @param {number} ratingA - product A's rating before this vote
 * @param {number} ratingB - product B's rating before this vote
 * @param {0 | 1} scoreA - 1 if product A got the vote, 0 if product B did
 * @param {number} [kFactor] - how much a single result can move a rating
 */
export function calculateElo(ratingA, ratingB, scoreA, kFactor = 4) {
  // Guard against bad inputs (e.g. a null rating from a malformed DB row)
  // reaching Math.pow and silently producing NaN ratings that would then
  // get written back to the database.
  for (const [label, value] of [
    ["ratingA", ratingA],
    ["ratingB", ratingB],
    ["scoreA", scoreA],
  ]) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new Error(
        `calculateElo: ${label} must be a number, received ${JSON.stringify(value)}`
      );
    }
  }
  if (scoreA !== 0 && scoreA !== 1) {
    throw new Error(`calculateElo: scoreA must be 0 or 1, received ${scoreA}`);
  }

  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;
  const scoreB = 1 - scoreA;

  // Floored at MIN_RATING so repeated losses can't push a product negative.
  const newRatingA = Math.max(
    MIN_RATING,
    Math.round(ratingA + kFactor * (scoreA - expectedA))
  );
  const newRatingB = Math.max(
    MIN_RATING,
    Math.round(ratingB + kFactor * (scoreB - expectedB))
  );

  return { newRatingA, newRatingB };
}

/**
 * Whether two products are allowed to battle, based on the rating-gap cap.
 * Keeps a much stronger product from being challenged by (or challenging)
 * a much weaker one.
 */
export function isMatchAllowed(ratingA, ratingB) {
  if (typeof ratingA !== "number" || typeof ratingB !== "number") {
    throw new Error("isMatchAllowed: both ratings must be numbers");
  }
  return Math.abs(ratingA - ratingB) <= MAX_RATING_GAP;
}
