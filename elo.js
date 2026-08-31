// Standard ELO rating math.
// scoreA: 1 if product A "won" this vote, 0 if product B won.
// kFactor controls how much a single result can move a rating.
//
// MVP NOTE: to keep the loop simple, we nudge ratings on every individual
// vote using a small kFactor (treat each vote as a tiny "match"), rather
// than waiting for a battle to fully close before recalculating. This is
// a deliberate simplification — a production version should likely batch
// the rating update once a battle's status flips to "completed" instead,
// so a single vote can't be gamed into an outsized rating swing.

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

  const newRatingA = Math.round(ratingA + kFactor * (scoreA - expectedA));
  const newRatingB = Math.round(ratingB + kFactor * (scoreB - expectedB));

  return { newRatingA, newRatingB };
}

export const STARTING_RATING = 1500;
