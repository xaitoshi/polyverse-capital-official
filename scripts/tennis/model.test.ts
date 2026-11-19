import assert from "node:assert/strict";
import { draftPick, eloWinProb, isValue, predict, rankPrior } from "../../src/lib/tennis/model.ts";
import { brier, flatStakePnl, gradePick, logLoss, resolutionFromPrices, summarize } from "../../src/lib/tennis/grade.ts";
import { classifyEvent, outcomeMids, parseSets, setComplete } from "../../src/lib/tennis/parse.ts";
import { namesMatch, playerId } from "../../src/lib/tennis/names.ts";
import type { MatchView } from "../../src/lib/tennis/types.ts";

// 100 Elo points → ~64%, matching Tennis Abstract's own scale note.
const p = eloWinProb(2100, 2000);
assert.ok(Math.abs(p - 0.64) < 0.005, `100pt gap should be ~64%, got ${p}`);

assert.ok(Math.abs(rankPrior(1)! - 2200) < 1e-6);
assert.ok(rankPrior(100)! < rankPrior(10)!);

const bothElo = predict({
  surface: "Hard",
  playerA: { elo: 1500, hElo: 1600, cElo: 1400, gElo: 1450, rank: 200 },
  playerB: { elo: 1500, hElo: 1500, cElo: 1500, gElo: 1500, rank: 200 },
  priceA: 0.5,
  priceB: 0.5,
});
assert.equal(bothElo.coverage, "elo");
assert.equal(bothElo.confidence, "high");
assert.ok(bothElo.probA > 0.6, "hard elo edge should favour A");
assert.equal(bothElo.inputs.ratingKindA, "surface-elo");

const unknownSurface = predict({
  surface: null,
  playerA: { elo: 1800, hElo: 1900, cElo: null, gElo: null, rank: 20 },
  playerB: { elo: 1700, hElo: 1600, cElo: null, gElo: null, rank: 40 },
  priceA: 0.6,
  priceB: 0.4,
});
assert.equal(unknownSurface.inputs.ratingKindA, "overall-elo");
assert.equal(unknownSurface.confidence, "medium");

const rankOnly = predict({
  surface: null,
  playerA: { elo: null, hElo: null, cElo: null, gElo: null, rank: 50 },
  playerB: { elo: null, hElo: null, cElo: null, gElo: null, rank: 200 },
  priceA: 0.55,
  priceB: 0.45,
});
assert.equal(rankOnly.coverage, "rank");
assert.ok(rankOnly.probA > 0.5);

const marketFallback = predict({
  surface: null,
  playerA: { elo: null, hElo: null, cElo: null, gElo: null, rank: null },
  playerB: { elo: null, hElo: null, cElo: null, gElo: null, rank: 10 },
  priceA: 0.3,
  priceB: 0.7,
});
assert.equal(marketFallback.coverage, "market");
assert.equal(marketFallback.confidence, "low");
assert.ok(Math.abs(marketFallback.probA - 0.3) < 1e-9);

// VALUE rules
assert.equal(isValue(0.6, 0.5), true);
assert.equal(isValue(0.54, 0.5), false);
assert.equal(isValue(0.99, 0.93), false);
assert.equal(isValue(0.97, 0.94), false);
assert.equal(isValue(0.9, null), false);

const future = Date.parse("2026-11-20T12:00:00Z");
const pick = draftPick({
  nowMs: Date.parse("2026-11-19T12:00:00Z"),
  startMs: future,
  surface: "Hard",
  playerA: { elo: 1500, hElo: 1700, cElo: null, gElo: null, rank: 40, form: { w: 8, l: 2, n: 10 }, serveSample: 8, firstInPct: 65, firstWonPct: 75 },
  playerB: { elo: 1500, hElo: 1550, cElo: null, gElo: null, rank: 90, form: { w: 4, l: 6, n: 10 }, serveSample: 8, firstInPct: 55, firstWonPct: 68 },
  priceA: 0.55,
  priceB: 0.45,
  playerAId: "a",
  playerBId: "b",
  playerAName: "A Player",
  playerBName: "B Player",
});
assert.ok(pick);
assert.equal(pick!.side, "a");
assert.equal(pick!.inputsVersion, "polyverse-tennis-v1");
assert.ok(pick!.inputs.formAdjA > 0);
assert.ok(pick!.inputs.serveAdjA > 0);
assert.equal(pick!.value, isValue(pick!.modelProb, pick!.marketPrice));

// Never backfill after start.
const late = draftPick({
  nowMs: future + 1000,
  startMs: future,
  surface: null,
  playerA: { elo: 2000, hElo: null, cElo: null, gElo: null, rank: 1 },
  playerB: { elo: 1400, hElo: null, cElo: null, gElo: null, rank: 500 },
  priceA: 0.8,
  priceB: 0.2,
  playerAId: "a",
  playerBId: "b",
  playerAName: "A",
  playerBName: "B",
});
assert.equal(late, null);

// Form with a short sample must not move the rating.
const noForm = predict({
  surface: null,
  playerA: { elo: 1600, hElo: null, cElo: null, gElo: null, rank: null, form: { w: 3, l: 0, n: 3 } },
  playerB: { elo: 1600, hElo: null, cElo: null, gElo: null, rank: null },
  priceA: 0.5,
  priceB: 0.5,
});
assert.equal(noForm.inputs.formAdjA, 0);
assert.ok(Math.abs(noForm.probA - 0.5) < 1e-9);

// Grading
assert.ok(Math.abs(flatStakePnl(0.4, true)! - 1.5) < 1e-9);
assert.equal(flatStakePnl(0.4, false), -1);
assert.ok(Math.abs(brier(0.7, true) - 0.09) < 1e-9);
const resWin = resolutionFromPrices(1, 0, true, "polymarket");
assert.equal(resWin.kind, "winner");
const resVoid = resolutionFromPrices(0.5, 0.5, true, "polymarket");
assert.equal(resVoid.kind, "void");
const resOpen = resolutionFromPrices(0.62, 0.38, false, "polymarket");
assert.equal(resOpen.kind, "open");

const graded = gradePick(pick!, resWin, "2026-11-20T15:00:00Z");
assert.equal(graded!.kind, "winner");
assert.equal(graded!.pickWon, true);
assert.ok(graded!.pnlFlat1u != null && graded!.pnlFlat1u > 0);

const voided = gradePick(pick!, resVoid, "2026-11-20T15:00:00Z");
assert.equal(voided!.kind, "void");
assert.equal(voided!.pnlFlat1u, null);

// Sets
assert.equal(setComplete(6, 4), true);
assert.equal(setComplete(7, 6), true);
assert.equal(setComplete(6, 5), false);
const sets = parseSets("7-6(7-4), 2-1");
assert.equal(sets.length, 2);
assert.equal(sets[0]!.tiebreak, "7-4");
assert.equal(sets[0]!.complete, true);
assert.equal(sets[1]!.complete, false);

// Stale filter: a September final is not "live" just because closed=false.
const now = Date.parse("2026-11-19T08:00:00Z");
assert.equal(
  classifyEvent({
    id: "1",
    slug: "atp-a-b-2026-09-26",
    title: "Old",
    startTime: "2026-09-26T12:00:00Z",
    period: "FT",
    sport: { sport: "atp" },
    markets: [{ sportsMarketType: "moneyline", outcomes: "[\"A\",\"B\"]", outcomePrices: "[\"1\",\"0\"]" }],
  }, now),
  "ignore",
);
assert.equal(
  classifyEvent({
    id: "2",
    slug: "itf-a-b-2026-11-19",
    title: "M15 Antalya: A vs B",
    startTime: "2026-11-19T06:00:00Z",
    period: "S2",
    live: true,
    sport: { sport: "itf" },
    markets: [{ sportsMarketType: "moneyline", outcomes: "[\"A\",\"B\"]", outcomePrices: "[\"0.4\",\"0.6\"]" }],
  }, now),
  "live",
);
assert.equal(
  classifyEvent({
    id: "3",
    slug: "atp-doubles-a-b-2026-11-20",
    title: "Doubles",
    startTime: "2026-11-20T12:00:00Z",
    sport: { sport: "atp" },
    markets: [{ sportsMarketType: "moneyline" }],
  }, now),
  "ignore",
);

const mids = outcomeMids({
  outcomes: "[\"A\",\"B\"]",
  outcomePrices: "[\"0.62\",\"0.38\"]",
  bestBid: 0.6,
  bestAsk: 0.64,
});
assert.equal(mids.names[0], "A");
assert.ok(Math.abs(mids.prices[0]! - 0.62) < 1e-9);
assert.ok(Math.abs(mids.prices[1]! - 0.38) < 1e-9);

assert.equal(namesMatch("Soon-Woo Kwon", "Soonwoo Kwon"), true);
assert.equal(namesMatch("Taro Daniel", "Daniel Michalski"), false);
assert.equal(playerId("Taro Daniel"), "taro-daniel");

// Empty book totals stay null, not zero-disguised rates.
const totals = summarize([] as MatchView[]);
assert.equal(totals.winRate, null);
assert.equal(totals.roi, null);
assert.equal(totals.brier, null);
assert.equal(totals.settled, 0);

// Log loss is finite at a clipped extreme.
assert.ok(Number.isFinite(logLoss(0, true)));

console.log("tennis model tests OK");
