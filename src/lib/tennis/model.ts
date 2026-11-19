import {
  ELO_SCALE,
  FIRST_IN_PER_PP,
  FIRST_WON_PER_PP,
  FORM_CAP,
  FORM_MIN_N,
  FORM_PER_RESULT,
  FORM_WINDOW,
  INPUTS_VERSION,
  RANK_PRIOR_BASE,
  RANK_PRIOR_LOG_K,
  RANK_PULL,
  RANK_PULL_CAP,
  SERVE_CAP,
  SERVE_MIN_N,
  VALUE_EDGE,
  VALUE_PRICE_CAP,
} from "./methodology";
import type { Confidence, Coverage, LockedPick, Side, Surface } from "./types";

export interface SideInput {
  elo: number | null;
  hElo: number | null;
  cElo: number | null;
  gElo: number | null;
  rank: number | null;
  /** Completed recent matches, newest first. */
  form?: { w: number; l: number; n: number } | null;
  firstInPct?: number | null;
  firstWonPct?: number | null;
  serveSample?: number | null;
}

export interface PredictInput {
  surface: Surface | null;
  playerA: SideInput;
  playerB: SideInput;
  priceA: number | null;
  priceB: number | null;
}

export interface PredictResult {
  probA: number;
  probB: number;
  confidence: Confidence;
  coverage: Coverage;
  inputs: LockedPick["inputs"];
  tieBreak: boolean;
}

export function rankPrior(rank: number): number | null {
  if (!Number.isFinite(rank) || rank < 1) return null;
  return RANK_PRIOR_BASE - RANK_PRIOR_LOG_K * Math.log(rank);
}

export function eloWinProb(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / ELO_SCALE));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function surfaceElo(p: SideInput, surface: Surface | null): { value: number; kind: "surface-elo" } | null {
  if (!surface) return null;
  const v = surface === "Hard" ? p.hElo : surface === "Clay" ? p.cElo : p.gElo;
  if (v == null || !Number.isFinite(v)) return null;
  return { value: v, kind: "surface-elo" };
}

function baseRating(
  p: SideInput,
  surface: Surface | null,
): { rating: number; kind: LockedPick["inputs"]["ratingKindA"] } | null {
  const surf = surfaceElo(p, surface);
  if (surf) return { rating: surf.value, kind: "surface-elo" };
  if (p.elo != null && Number.isFinite(p.elo)) return { rating: p.elo, kind: "overall-elo" };
  if (p.rank != null) {
    const prior = rankPrior(p.rank);
    if (prior != null) return { rating: prior, kind: "rank-prior" };
  }
  return null;
}

function formAdj(p: SideInput): number {
  const f = p.form;
  if (!f || f.n < FORM_MIN_N) return 0;
  const windowN = Math.min(f.n, FORM_WINDOW);
  // form.w/l are already computed on the window by the caller.
  if (f.w + f.l < FORM_MIN_N) return 0;
  void windowN;
  return clamp((f.w - f.l) * FORM_PER_RESULT, -FORM_CAP, FORM_CAP);
}

function serveDelta(a: SideInput, b: SideInput): number {
  const sampleOk =
    (a.serveSample ?? 0) >= SERVE_MIN_N && (b.serveSample ?? 0) >= SERVE_MIN_N;
  if (!sampleOk) return 0;
  let adj = 0;
  if (a.firstInPct != null && b.firstInPct != null) {
    adj += clamp((a.firstInPct - b.firstInPct) * FIRST_IN_PER_PP, -SERVE_CAP, SERVE_CAP);
  }
  if (a.firstWonPct != null && b.firstWonPct != null) {
    adj += clamp((a.firstWonPct - b.firstWonPct) * FIRST_WON_PER_PP, -SERVE_CAP, SERVE_CAP);
  }
  return adj;
}

function normalizeMarket(priceA: number | null, priceB: number | null): { a: number; b: number } | null {
  if (priceA == null || priceB == null) return null;
  if (!(priceA > 0 && priceA < 1 && priceB > 0 && priceB < 1)) return null;
  const s = priceA + priceB;
  if (s <= 0) return null;
  return { a: priceA / s, b: priceB / s };
}

/**
 * Pre-match probability for side A. Does not look at the clock.
 * Callers must refuse to persist it after start.
 */
export function predict(input: PredictInput): PredictResult {
  const emptyInputs = (partial: Partial<LockedPick["inputs"]> = {}): LockedPick["inputs"] => ({
    ratingA: null,
    ratingB: null,
    ratingKindA: "none",
    ratingKindB: "none",
    surface: input.surface,
    formAdjA: 0,
    formAdjB: 0,
    serveAdjA: 0,
    rankPullA: 0,
    rankPullB: 0,
    ...partial,
  });

  const aBase = baseRating(input.playerA, input.surface);
  const bBase = baseRating(input.playerB, input.surface);

  if (!aBase || !bBase) {
    const mkt = normalizeMarket(input.priceA, input.priceB);
    const probA = mkt ? mkt.a : 0.5;
    return {
      probA,
      probB: 1 - probA,
      confidence: "low",
      coverage: mkt ? "market" : "none",
      tieBreak: !mkt,
      inputs: emptyInputs(),
    };
  }

  const priorA = input.playerA.rank != null ? rankPrior(input.playerA.rank) : null;
  const priorB = input.playerB.rank != null ? rankPrior(input.playerB.rank) : null;
  let rankPullA = 0;
  let rankPullB = 0;
  let ratingA = aBase.rating;
  let ratingB = bBase.rating;
  if (aBase.kind !== "rank-prior" && priorA != null) {
    rankPullA = clamp((priorA - aBase.rating) * RANK_PULL, -RANK_PULL_CAP, RANK_PULL_CAP);
    ratingA += rankPullA;
  }
  if (bBase.kind !== "rank-prior" && priorB != null) {
    rankPullB = clamp((priorB - bBase.rating) * RANK_PULL, -RANK_PULL_CAP, RANK_PULL_CAP);
    ratingB += rankPullB;
  }

  const formA = formAdj(input.playerA);
  const formB = formAdj(input.playerB);
  ratingA += formA;
  ratingB += formB;

  const serveA = serveDelta(input.playerA, input.playerB);
  ratingA += serveA;

  const probA = eloWinProb(ratingA, ratingB);
  const bothSurface = aBase.kind === "surface-elo" && bBase.kind === "surface-elo";
  const anyRankOnly = aBase.kind === "rank-prior" || bBase.kind === "rank-prior";
  const coverage: Coverage = anyRankOnly
    ? aBase.kind === "rank-prior" && bBase.kind === "rank-prior"
      ? "rank"
      : "mixed"
    : "elo";
  const confidence: Confidence = bothSurface ? "high" : "medium";

  return {
    probA,
    probB: 1 - probA,
    confidence,
    coverage,
    tieBreak: false,
    inputs: emptyInputs({
      ratingA,
      ratingB,
      ratingKindA: aBase.kind,
      ratingKindB: bBase.kind,
      formAdjA: formA,
      formAdjB: formB,
      serveAdjA: serveA,
      rankPullA,
      rankPullB,
    }),
  };
}

export function isValue(modelProb: number, marketPrice: number | null): boolean {
  if (marketPrice == null || !Number.isFinite(marketPrice)) return false;
  if (marketPrice >= VALUE_PRICE_CAP) return false;
  return modelProb - marketPrice >= VALUE_EDGE - 1e-12;
}

export interface PickDraftInput extends PredictInput {
  nowMs: number;
  startMs: number;
  playerAId: string;
  playerBId: string;
  playerAName: string;
  playerBName: string;
}

/**
 * Returns a locked pick only when the match has not started.
 * Exactly-50% ties break to rank, then price, then side A, and are low confidence.
 */
export function draftPick(input: PickDraftInput): LockedPick | null {
  if (!(input.startMs > input.nowMs)) return null;
  const pred = predict(input);
  let side: Side;
  let tie = pred.tieBreak;
  if (pred.probA > pred.probB + 1e-12) side = "a";
  else if (pred.probB > pred.probA + 1e-12) side = "b";
  else {
    tie = true;
    const ra = input.playerA.rank;
    const rb = input.playerB.rank;
    if (ra != null && rb != null && ra !== rb) side = ra < rb ? "a" : "b";
    else if (input.priceA != null && input.priceB != null && input.priceA !== input.priceB) {
      side = input.priceA > input.priceB ? "a" : "b";
    } else side = "a";
  }
  const modelProb = side === "a" ? pred.probA : pred.probB;
  const marketPrice = side === "a" ? input.priceA : input.priceB;
  const edgePp = marketPrice == null ? null : (modelProb - marketPrice) * 100;
  return {
    pickedAt: new Date(input.nowMs).toISOString(),
    side,
    playerId: side === "a" ? input.playerAId : input.playerBId,
    playerName: side === "a" ? input.playerAName : input.playerBName,
    modelProb,
    marketPrice,
    edgePp,
    value: isValue(modelProb, marketPrice),
    confidence: tie ? "low" : pred.confidence,
    coverage: pred.coverage,
    inputsVersion: INPUTS_VERSION,
    inputs: pred.inputs,
  };
}
