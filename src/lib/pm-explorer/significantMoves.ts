/**
 * Significant price-move detection + associated-trade context (interpretation-first).
 *
 * Honest limits:
 * - Moves come from CLOB price-history ticks (often sparse; window size adapts to tick gaps).
 * - Associated trades are ONLY fills present in the loaded sample (≤ TRADE_MAX_PAGES*TRADE_PAGE_LIMIT).
 * - Never attributes a full move to incomplete trade coverage.
 * - No causal / informed-wallet / maker-taker / news claims.
 */

import { TRADE_MAX_PAGES, TRADE_PAGE_LIMIT } from "./config";
import type { PricePoint, Provenance, TradePoint } from "./types";

export const MOVE_WINDOWS_MS = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "60m": 60 * 60_000,
} as const;

export type MoveWindowKey = keyof typeof MOVE_WINDOWS_MS;

export type TradeRelation = "preceding" | "during" | "after";

export type PersistenceKind = "held" | "partial_reversion" | "full_reversion" | "unavailable";

export type TradeCoverageStatus = "full_overlap" | "partial_overlap" | "no_overlap" | "truncated_sample";

export interface AssociatedTrade {
  trade: TradePoint;
  relation: TradeRelation;
  /** ms from move start (negative = preceding) */
  offsetMs: number;
}

export interface SignificantMove {
  id: string;
  tokenId: string;
  outcomeLabel: string;
  windowKey: MoveWindowKey;
  /** Requested window; actual span may be longer when ticks are sparse. */
  requestedWindowMs: number;
  /** Observed tick span used for Δp. */
  observedSpanMs: number;
  startTs: string;
  endTs: string;
  startMs: number;
  endMs: number;
  startPrice: number;
  endPrice: number;
  /** Absolute probability-point change (0–100 scale). */
  absPp: number;
  signedPp: number;
  direction: "up" | "down";
  tickCountInSpan: number;
  medianTickGapMs: number;
  /** Trades for THIS outcome token only, overlapping / near the window. */
  associatedTrades: AssociatedTrade[];
  buyNotional: number;
  sellNotional: number;
  tradeCount: number;
  coverage: {
    status: TradeCoverageStatus;
    tradesCompleteness: Provenance["completeness"];
    priceSpanStartMs: number;
    priceSpanEndMs: number;
    tradeSampleStartMs: number | null;
    tradeSampleEndMs: number | null;
    /** Fraction of move span that intersects the loaded trade sample timeline. */
    overlapFraction: number;
    note: string;
  };
  persistence: {
    kind: PersistenceKind;
    lookAheadMs: number;
    laterTickCount: number;
    priceAfterLookAhead?: number;
    note: string;
  };
  /** Top associated trades by notional (already filtered to this outcome). */
  largestTrades: AssociatedTrade[];
  /** Existing phase markers that fall inside the move (optional; never claimed as verified news). */
  optionalMarkerLabels: string[];
  /** Human-readable non-causal summary lines. */
  contextLines: string[];
}

export type DetectMovesOpts = {
  tokenId: string;
  outcomeLabel: string;
  prices: PricePoint[];
  trades: TradePoint[];
  provenance: Provenance;
  windowKey?: MoveWindowKey;
  /** Max highlights (default 6). */
  maxMoves?: number;
  /** Min |pp| to keep a candidate (default adapts with tick sparsity). */
  minAbsPp?: number;
  /** How far before/after the move to collect "nearby" trades (default = observed span). */
  nearbyPadMs?: number;
  /** Cap largest trades listed per move. */
  topTrades?: number;
  /** Optional existing markers (labels only; never "verified catalyst"). */
  markers?: { ts: string; label: string }[];
  /** Replay playhead — ignore prices/trades after this (no future leakage). */
  playheadMs?: number | null;
};

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid]! : (a[mid - 1]! + a[mid]!) / 2;
}

export function buildTokenSeries(
  prices: PricePoint[],
  tokenId: string,
  playheadMs?: number | null
): { ms: number; price: number; ts: string }[] {
  const rows = prices
    .filter((p) => p.tokenId === tokenId && Number.isFinite(p.price))
    .map((p) => ({ ms: Date.parse(p.ts), price: p.price, ts: p.ts }))
    .filter((r) => Number.isFinite(r.ms))
    .filter((r) => (playheadMs == null ? true : r.ms <= playheadMs))
    .sort((a, b) => a.ms - b.ms);
  // Dedupe same timestamp — keep last
  const out: typeof rows = [];
  for (const r of rows) {
    if (out.length && out[out.length - 1]!.ms === r.ms) out[out.length - 1] = r;
    else out.push(r);
  }
  return out;
}

export function seriesTickStats(series: { ms: number }[]): {
  medianGapMs: number;
  count: number;
  spanMs: number;
} {
  if (series.length < 2) {
    return { medianGapMs: 0, count: series.length, spanMs: 0 };
  }
  const gaps: number[] = [];
  for (let i = 1; i < series.length; i++) gaps.push(series[i]!.ms - series[i - 1]!.ms);
  return {
    medianGapMs: median(gaps),
    count: series.length,
    spanMs: series[series.length - 1]!.ms - series[0]!.ms,
  };
}

/**
 * Pick effective scan step: at least 1 tick, and at least ~requested window /
 * but never finer than ~1 median tick gap (avoids fake 1-min precision).
 */
export function effectiveWindowMs(
  requestedMs: number,
  medianGapMs: number,
  windowKey: MoveWindowKey = "15m"
): { scanMs: number; minTicks: number } {
  const gap = Math.max(medianGapMs, 60_000); // never finer than 1m when ticks denser
  // Scale minimum tick span with the user window so sparse ~hourly CLOB history
  // still yields interpretable swings (tied to resolution, not fake 1-min bars).
  const gapMultiples: Record<MoveWindowKey, number> = { "5m": 2, "15m": 6, "60m": 12 };
  const multiples = gapMultiples[windowKey];
  const minTicks = multiples + 1;
  const scanMs = Math.max(requestedMs, gap * multiples);
  return { scanMs, minTicks };
}

function findEndIndex(
  series: { ms: number; price: number }[],
  startIdx: number,
  scanMs: number
): number {
  const startMs = series[startIdx]!.ms;
  let end = startIdx;
  for (let j = startIdx + 1; j < series.length; j++) {
    if (series[j]!.ms - startMs <= scanMs) end = j;
    else break;
  }
  return end;
}

export function detectSignificantMoves(opts: DetectMovesOpts): SignificantMove[] {
  const windowKey = opts.windowKey ?? "15m";
  const requestedMs = MOVE_WINDOWS_MS[windowKey];
  const maxMoves = opts.maxMoves ?? 6;
  const topTrades = opts.topTrades ?? 5;
  const series = buildTokenSeries(opts.prices, opts.tokenId, opts.playheadMs);
  const stats = seriesTickStats(series);
  if (series.length < 3 || stats.medianGapMs <= 0) return [];

  const { scanMs, minTicks } = effectiveWindowMs(requestedMs, stats.medianGapMs, windowKey);
  // Adaptive min pp: denser series → slightly lower threshold; sparse → higher
  // Floors are in probability points. Sparse ~60m CLOB ticks often move only 1–3pp
  // across a day — keep thresholds low enough to surface real swings without
  // inventing sub-tick precision.
  const adaptiveMin =
    opts.minAbsPp ??
    (stats.medianGapMs >= 30 * 60_000 ? 1.5 : stats.medianGapMs >= 10 * 60_000 ? 1.5 : 1.0);

  type Cand = {
    startIdx: number;
    endIdx: number;
    absPp: number;
    signedPp: number;
  };
  const cands: Cand[] = [];

  for (let i = 0; i < series.length; i++) {
    const endIdx = findEndIndex(series, i, scanMs);
    if (endIdx - i + 1 < minTicks) continue;
    // Peak swing inside the window (not merely endpoint-to-endpoint), so a rise
    // that later partially reverts still registers as a significant move.
    let minI = i;
    let maxI = i;
    for (let j = i; j <= endIdx; j++) {
      if (series[j]!.price < series[minI]!.price) minI = j;
      if (series[j]!.price > series[maxI]!.price) maxI = j;
    }
    if (minI === maxI) continue;
    const upFirst = minI < maxI;
    const a = upFirst ? minI : maxI;
    const b = upFirst ? maxI : minI;
    const signedPp = (series[b]!.price - series[a]!.price) * 100;
    const absPp = Math.abs(signedPp);
    if (absPp < adaptiveMin) continue;
    cands.push({ startIdx: a, endIdx: b, absPp, signedPp });
  }

  // Greedy non-overlapping pick by absPp (deconflict labels)
  cands.sort((a, b) => b.absPp - a.absPp || a.startIdx - b.startIdx);
  const picked: Cand[] = [];
  const used = new Set<number>();
  for (const c of cands) {
    let overlap = false;
    for (let k = c.startIdx; k <= c.endIdx; k++) {
      if (used.has(k)) {
        overlap = true;
        break;
      }
    }
    if (overlap) continue;
    for (let k = c.startIdx; k <= c.endIdx; k++) used.add(k);
    picked.push(c);
    if (picked.length >= maxMoves) break;
  }
  picked.sort((a, b) => series[a.startIdx]!.ms - series[b.startIdx]!.ms);

  const tradesForToken = opts.trades
    .filter((t) => t.tokenId === opts.tokenId)
    .filter((t) => (opts.playheadMs == null ? true : Date.parse(t.ts) <= opts.playheadMs))
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

  const tradeMs = tradesForToken.map((t) => Date.parse(t.ts)).filter(Number.isFinite);
  const tradeSampleStartMs = tradeMs.length ? Math.min(...tradeMs) : null;
  const tradeSampleEndMs = tradeMs.length ? Math.max(...tradeMs) : null;

  const priceSpanStartMs = series[0]!.ms;
  const priceSpanEndMs = series[series.length - 1]!.ms;
  const truncated =
    opts.provenance.completeness === "truncated" ||
    opts.provenance.completeness === "partial_page" ||
    opts.provenance.warnings.some((w) => /truncat/i.test(w));

  const moves: SignificantMove[] = [];

  for (const c of picked) {
    const start = series[c.startIdx]!;
    const end = series[c.endIdx]!;
    const observedSpanMs = end.ms - start.ms;
    const pad = opts.nearbyPadMs ?? Math.max(observedSpanMs, stats.medianGapMs);
    const winStart = start.ms;
    const winEnd = end.ms;

    const associated: AssociatedTrade[] = [];
    for (const tr of tradesForToken) {
      const tms = Date.parse(tr.ts);
      if (!Number.isFinite(tms)) continue;
      if (tms < winStart - pad || tms > winEnd + pad) continue;
      let relation: TradeRelation;
      if (tms < winStart) relation = "preceding";
      else if (tms > winEnd) relation = "after";
      else relation = "during";
      associated.push({ trade: tr, relation, offsetMs: tms - winStart });
    }

    const during = associated.filter((a) => a.relation === "during");
    const buyNotional = during
      .filter((a) => a.trade.side === "BUY")
      .reduce((s, a) => s + a.trade.notionalUsdc, 0);
    const sellNotional = during
      .filter((a) => a.trade.side === "SELL")
      .reduce((s, a) => s + a.trade.notionalUsdc, 0);

    // Coverage: intersection of [winStart,winEnd] with trade sample span
    let overlapFraction = 0;
    let coverageStatus: TradeCoverageStatus = "no_overlap";
    if (tradeSampleStartMs != null && tradeSampleEndMs != null && observedSpanMs > 0) {
      const ovStart = Math.max(winStart, tradeSampleStartMs);
      const ovEnd = Math.min(winEnd, tradeSampleEndMs);
      const ov = Math.max(0, ovEnd - ovStart);
      overlapFraction = ov / observedSpanMs;
      if (truncated) coverageStatus = "truncated_sample";
      else if (overlapFraction >= 0.95 && during.length > 0) coverageStatus = "full_overlap";
      else if (overlapFraction > 0 || during.length > 0) coverageStatus = "partial_overlap";
      else coverageStatus = "no_overlap";
    } else if (truncated) {
      coverageStatus = "truncated_sample";
    }

    const coverageNote = (() => {
      if (coverageStatus === "truncated_sample") {
        return `Trade sample is ${opts.provenance.completeness} (≤${TRADE_MAX_PAGES * TRADE_PAGE_LIMIT} fills). Do not attribute the full ${c.absPp.toFixed(1)}pp move to these trades alone.`;
      }
      if (coverageStatus === "no_overlap") {
        return "No loaded fills overlap this price window — move is from price ticks only; associated volume unknown.";
      }
      if (coverageStatus === "partial_overlap") {
        return `Only ~${Math.round(overlapFraction * 100)}% of this move's time span intersects the loaded trade sample. Associations are incomplete.`;
      }
      return "Loaded fills cover this move's time span; still only observed fills — not proof of causality.";
    })();

    // Persistence: look ahead one requested window (or 2 median gaps), need enough later ticks
    const lookAheadMs = Math.max(requestedMs, stats.medianGapMs * 2);
    const later = series.filter((r) => r.ms > end.ms && r.ms <= end.ms + lookAheadMs);
    let persistence: SignificantMove["persistence"];
    if (later.length < 2) {
      persistence = {
        kind: "unavailable",
        lookAheadMs,
        laterTickCount: later.length,
        note:
          later.length === 0 && end.ms >= priceSpanEndMs - stats.medianGapMs
            ? "Right-edge of loaded price history — persistence not measurable yet."
            : "Too few later price ticks after the move — persistence unavailable (sparse resolution).",
      };
    } else {
      const after = later[later.length - 1]!.price;
      const move = end.price - start.price;
      const retained = after - start.price;
      const frac = move === 0 ? 0 : retained / move;
      let kind: PersistenceKind;
      if (frac >= 0.7) kind = "held";
      else if (frac <= 0.15) kind = "full_reversion";
      else kind = "partial_reversion";
      persistence = {
        kind,
        lookAheadMs,
        laterTickCount: later.length,
        priceAfterLookAhead: after,
        note: `After ~${Math.round(lookAheadMs / 60_000)}m look-ahead (${later.length} ticks): ${kind.replace("_", " ")}. Descriptive only — not a forecast.`,
      };
    }

    const largest = [...associated]
      .sort((a, b) => b.trade.notionalUsdc - a.trade.notionalUsdc)
      .slice(0, topTrades);

    const markers = (opts.markers || [])
      .filter((m) => {
        const t = Date.parse(m.ts);
        return Number.isFinite(t) && t >= winStart && t <= winEnd;
      })
      .map((m) => m.label);

    const signedPp = c.signedPp;
    const direction = signedPp >= 0 ? "up" : "down";
    const contextLines = [
      `${opts.outcomeLabel} ${direction === "up" ? "rose" : "fell"} ${c.absPp.toFixed(1)}pp (${(start.price * 100).toFixed(1)}¢ → ${(end.price * 100).toFixed(1)}¢) over ${Math.round(observedSpanMs / 60_000)}m of price ticks (requested ${windowKey}; median tick gap ~${Math.round(stats.medianGapMs / 60_000)}m).`,
      `Associated trades = fills for this outcome only that fall in/near the window — association ≠ evidence these fills moved the market.`,
      coverageNote,
      persistence.note,
      markers.length
        ? `Optional local markers in window: ${markers.join("; ")} (not a verified catalyst feed).`
        : "No verified catalyst attached — explorer has no external verified news feed.",
    ];

    moves.push({
      id: `${opts.tokenId}:${start.ms}:${end.ms}:${windowKey}`,
      tokenId: opts.tokenId,
      outcomeLabel: opts.outcomeLabel,
      windowKey,
      requestedWindowMs: requestedMs,
      observedSpanMs,
      startTs: start.ts,
      endTs: end.ts,
      startMs: start.ms,
      endMs: end.ms,
      startPrice: start.price,
      endPrice: end.price,
      absPp: c.absPp,
      signedPp,
      direction,
      tickCountInSpan: c.endIdx - c.startIdx + 1,
      medianTickGapMs: stats.medianGapMs,
      associatedTrades: associated,
      buyNotional,
      sellNotional,
      tradeCount: during.length,
      coverage: {
        status: coverageStatus,
        tradesCompleteness: opts.provenance.completeness,
        priceSpanStartMs,
        priceSpanEndMs,
        tradeSampleStartMs,
        tradeSampleEndMs,
        overlapFraction,
        note: coverageNote,
      },
      persistence,
      largestTrades: largest,
      optionalMarkerLabels: markers,
      contextLines,
    });
  }

  return moves;
}

/** Aggregate muted trade density for chart background (not individual clutter). */
export function aggregateTradeDensity(
  trades: TradePoint[],
  tokenId: string,
  bucketMs: number,
  playheadMs?: number | null
): { t: number; count: number; notional: number }[] {
  const map = new Map<number, { count: number; notional: number }>();
  for (const tr of trades) {
    if (tr.tokenId !== tokenId) continue;
    const ms = Date.parse(tr.ts);
    if (!Number.isFinite(ms)) continue;
    if (playheadMs != null && ms > playheadMs) continue;
    const b = Math.floor(ms / bucketMs) * bucketMs;
    const cur = map.get(b) || { count: 0, notional: 0 };
    cur.count += 1;
    cur.notional += tr.notionalUsdc;
    map.set(b, cur);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, v]) => ({ t, count: v.count, notional: v.notional }));
}
