/**
 * polyverse-tennis-v1
 *
 * Transparent pre-match win model. Coefficients live here so the record page
 * and the picker cannot drift apart. This is not a live in-play model.
 */

export const INPUTS_VERSION = "polyverse-tennis-v1";

/** Standard Elo logistic. 100 points ≈ 64% at equal best-of-three assumption. */
export const ELO_SCALE = 400;

/**
 * Rank prior used only when Tennis Abstract Elo is missing for that player.
 * rating = base - logK * ln(rank). Rank 1 → 2200, rank 100 → ~1717, rank 500 → ~1548.
 * This is a prior, not an Elo published by anyone.
 */
export const RANK_PRIOR_BASE = 2200;
export const RANK_PRIOR_LOG_K = 105;

/** When both Elo and rank exist, pull the Elo slightly toward the rank prior. */
export const RANK_PULL = 0.08;
export const RANK_PULL_CAP = 25;

/** Recent form from Tennis Abstract recent rows. Applied only when n >= FORM_MIN_N. */
export const FORM_PER_RESULT = 3;
export const FORM_CAP = 18;
export const FORM_MIN_N = 5;
export const FORM_WINDOW = 10;

/**
 * Serve additives, in rating points, only when both players have a sample
 * of at least SERVE_MIN_N completed matches with that stat.
 */
export const FIRST_IN_PER_PP = 0.35;
export const FIRST_WON_PER_PP = 0.25;
export const SERVE_CAP = 12;
export const SERVE_MIN_N = 5;

/** VALUE when picked-side model probability minus market mid is at least this. */
export const VALUE_EDGE = 0.05;
/** No VALUE flag when the picked side is priced at or above this. */
export const VALUE_PRICE_CAP = 0.93;

/** Probabilities are clipped here before log loss so 0/1 prices cannot explode. */
export const LOG_LOSS_CLIP = 1e-3;

export const SHARE_URL = "https://share.xyz/r/polyverse";

export const METHODOLOGY_SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: "What this book is",
    body: [
      "Polyverse publishes a pre-match pick for every open Polymarket tennis singles match-winner market (ATP, WTA, Challenger, ITF). Doubles are excluded.",
      "Polyverse does not place orders, connect wallets, or hold an account for you. Every trade control on this site is a link to Share.",
      "A pick is written once, before the scheduled start, and is never edited or backfilled. If a match is already live when this book first sees it, the pick cell stays empty.",
    ],
  },
  {
    heading: "Win probability",
    body: [
      "When both players have a Tennis Abstract rating, P(A) = 1 / (1 + 10^((R_B − R_A) / 400)).",
      "If the match surface is known from a Tennis Abstract recent-result row for that tournament, the surface rating is used (hElo, cElo, or gElo). Those figures are already Tennis Abstract's blend of overall Elo and a surface-only rating. If the surface is unknown, overall Elo is used and confidence is capped at medium.",
      `If Elo is missing, a rank prior is used: ${RANK_PRIOR_BASE} − ${RANK_PRIOR_LOG_K}·ln(rank). It is labelled rank-prior, not Elo.`,
      `When both Elo and rank exist, the rating is pulled ${RANK_PULL * 100}% of the way from Elo toward the rank prior, capped at ±${RANK_PULL_CAP} points.`,
      `Recent form, when at least ${FORM_MIN_N} completed matches exist in the last ${FORM_WINDOW} Tennis Abstract rows, adds (wins − losses) × ${FORM_PER_RESULT} points, capped at ±${FORM_CAP}.`,
      `First-serve in and first-serve points won add a small gap between the two players (×${FIRST_IN_PER_PP} and ×${FIRST_WON_PER_PP} per percentage point, each capped at ±${SERVE_CAP}) only when both samples have at least ${SERVE_MIN_N} matches. Hold% and return% are not invented from other columns.`,
      "If either player has neither Elo nor a rank, the match falls back to the Polymarket mid as the model probability. Confidence is low. The side above 50% is still picked. Edge is then about zero, so it is not marked VALUE.",
      "A tie at exactly 50% breaks to the better (lower) rank, then to the higher market price, then to side A. The tie-break is recorded as low confidence.",
    ],
  },
  {
    heading: "VALUE flag",
    body: [
      `VALUE means the locked model probability on the picked side exceeds the Polymarket mid by at least ${VALUE_EDGE * 100} percentage points.`,
      `Favourites priced at or above ${VALUE_PRICE_CAP * 100}¢ are never flagged VALUE, even if the model is higher.`,
    ],
  },
  {
    heading: "Grading",
    body: [
      "A pick is graded only after Polymarket resolves the match-winner market, or the event is void.",
      "Winner: the outcome priced at about 100¢ when the market is closed. Flat stake is 1 unit risked at the pick-time price p. Win pnl = (1 − p) / p. Loss pnl = −1. ROI is total pnl divided by the number of non-void settled picks.",
      "Void: a closed market resolved at 50–50 (cancelled, or not played). Voids are listed and excluded from W–L, ROI, Brier, and log loss.",
      "Retirement after the match has started follows the Polymarket resolution and counts. Retirement or cancellation before the start, when the market voids at 50–50, does not count.",
      `Brier score is the mean of (p − y)² on the picked-side probability, y = 1 if that side won. Log loss clips p into [${LOG_LOSS_CLIP}, ${1 - LOG_LOSS_CLIP}] before −(y·ln p + (1−y)·ln(1−p)).`,
    ],
  },
  {
    heading: "What is not in v1",
    body: [
      "No in-play updating of the locked number. The scoreboard is live; the pick is pre-match.",
      "No doubles. No api-tennis.com feed unless API_TENNIS_KEY is configured later. The provider interface is in the repo; the free path is ESPN rankings, Tennis Abstract Elo and recent rows, Wikimedia photos, and Polymarket.",
      "Missing numbers are shown as an em dash. They are not filled with zeros or league averages.",
    ],
  },
];
