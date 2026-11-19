import { LOG_LOSS_CLIP } from "./methodology";
import type {
  CalibrationBin,
  LockedPick,
  MatchView,
  RecordSlice,
  RecordTotals,
  RecordView,
  SettledResult,
  Side,
} from "./types";

export function flatStakePnl(price: number, won: boolean): number | null {
  if (!(price > 0 && price < 1)) return null;
  return won ? (1 - price) / price : -1;
}

export function brier(prob: number, won: boolean): number {
  const y = won ? 1 : 0;
  return (prob - y) ** 2;
}

export function logLoss(prob: number, won: boolean): number {
  const p = Math.min(1 - LOG_LOSS_CLIP, Math.max(LOG_LOSS_CLIP, prob));
  const y = won ? 1 : 0;
  return -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
}

export interface Resolution {
  kind: "winner" | "void" | "open";
  winnerSide: Side | null;
  source: string;
}

/** Interpret a closed moneyline. 50–50 closed is void. Open markets stay open. */
export function resolutionFromPrices(
  priceA: number | null,
  priceB: number | null,
  marketClosed: boolean,
  source: string,
): Resolution {
  if (!marketClosed || priceA == null || priceB == null) return { kind: "open", winnerSide: null, source };
  const aWin = priceA >= 0.99 && priceB <= 0.02;
  const bWin = priceB >= 0.99 && priceA <= 0.02;
  if (aWin) return { kind: "winner", winnerSide: "a", source };
  if (bWin) return { kind: "winner", winnerSide: "b", source };
  if (Math.abs(priceA - 0.5) <= 0.02 && Math.abs(priceB - 0.5) <= 0.02) {
    return { kind: "void", winnerSide: null, source };
  }
  return { kind: "open", winnerSide: null, source };
}

export function gradePick(pick: LockedPick, resolution: Resolution, settledAt: string): SettledResult | null {
  if (resolution.kind === "open") return null;
  if (resolution.kind === "void") {
    return {
      settledAt,
      kind: "void",
      winnerSide: null,
      source: resolution.source,
      pickWon: null,
      pnlFlat1u: null,
      brier: null,
      logLoss: null,
    };
  }
  const won = resolution.winnerSide === pick.side;
  const price = pick.marketPrice;
  return {
    settledAt,
    kind: "winner",
    winnerSide: resolution.winnerSide,
    source: resolution.source,
    pickWon: won,
    pnlFlat1u: price == null ? null : flatStakePnl(price, won),
    brier: brier(pick.modelProb, won),
    logLoss: logLoss(pick.modelProb, won),
  };
}

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((s, n) => s + n, 0) / xs.length;
}

export function emptyTotals(pending = 0): RecordTotals {
  return {
    settled: 0,
    wins: 0,
    losses: 0,
    voids: 0,
    pending,
    winRate: null,
    valueWins: 0,
    valueLosses: 0,
    valueSettled: 0,
    roi: null,
    brier: null,
    logLoss: null,
    stake: "flat 1u at the pick-time price",
  };
}

export function summarize(matches: MatchView[]): RecordTotals {
  let wins = 0;
  let losses = 0;
  let voids = 0;
  let pending = 0;
  let valueWins = 0;
  let valueLosses = 0;
  const pnls: number[] = [];
  const briers: number[] = [];
  const logs: number[] = [];
  for (const m of matches) {
    if (!m.pick) continue;
    if (!m.result) {
      if (m.status === "upcoming" || m.status === "live" || m.status === "suspended") pending += 1;
      continue;
    }
    if (m.result.kind === "void") {
      voids += 1;
      continue;
    }
    if (m.result.pickWon) {
      wins += 1;
      if (m.pick.value) valueWins += 1;
    } else if (m.result.pickWon === false) {
      losses += 1;
      if (m.pick.value) valueLosses += 1;
    }
    if (m.result.pnlFlat1u != null) pnls.push(m.result.pnlFlat1u);
    if (m.result.brier != null) briers.push(m.result.brier);
    if (m.result.logLoss != null) logs.push(m.result.logLoss);
  }
  const settled = wins + losses;
  return {
    settled,
    wins,
    losses,
    voids,
    pending,
    winRate: settled ? wins / settled : null,
    valueWins,
    valueLosses,
    valueSettled: valueWins + valueLosses,
    roi: pnls.length ? pnls.reduce((s, n) => s + n, 0) / pnls.length : null,
    brier: mean(briers),
    logLoss: mean(logs),
    stake: "flat 1u at the pick-time price",
  };
}

function sliceOf(key: string, rows: { won: boolean; pnl: number | null; brier: number | null }[]): RecordSlice {
  const wins = rows.filter((r) => r.won).length;
  const losses = rows.length - wins;
  const pnls = rows.map((r) => r.pnl).filter((n): n is number => n != null);
  const briers = rows.map((r) => r.brier).filter((n): n is number => n != null);
  return {
    key,
    settled: rows.length,
    wins,
    losses,
    winRate: rows.length ? wins / rows.length : null,
    roi: pnls.length ? pnls.reduce((s, n) => s + n, 0) / pnls.length : null,
    brier: mean(briers),
  };
}

export function groupSlices(
  matches: MatchView[],
  keyFn: (m: MatchView) => string | null,
): RecordSlice[] {
  const groups = new Map<string, { won: boolean; pnl: number | null; brier: number | null }[]>();
  for (const m of matches) {
    if (!m.pick || !m.result || m.result.kind !== "winner" || m.result.pickWon == null) continue;
    const key = keyFn(m);
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push({ won: m.result.pickWon, pnl: m.result.pnlFlat1u, brier: m.result.brier });
    groups.set(key, arr);
  }
  return [...groups.entries()]
    .map(([key, rows]) => sliceOf(key, rows))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function calibration(matches: MatchView[], bins = 5): CalibrationBin[] {
  const width = 1 / bins;
  const out: CalibrationBin[] = [];
  for (let i = 0; i < bins; i++) {
    const from = i * width;
    const to = (i + 1) * width;
    const rows = matches.filter((m) => {
      if (!m.pick || !m.result || m.result.kind !== "winner" || m.result.pickWon == null) return false;
      const p = m.pick.modelProb;
      return i === bins - 1 ? p >= from && p <= to : p >= from && p < to;
    });
    out.push({
      from,
      to,
      n: rows.length,
      meanProb: rows.length ? rows.reduce((s, m) => s + m.pick!.modelProb, 0) / rows.length : null,
      freq: rows.length ? rows.filter((m) => m.result!.pickWon).length / rows.length : null,
    });
  }
  return out;
}

export function buildRecord(matches: MatchView[], generatedAt: string, inputsVersion: string): RecordView {
  const pending = matches
    .filter((m) => m.pick && !m.result)
    .map(toPickRow);
  const settled = matches
    .filter((m) => m.pick && m.result)
    .map(toPickRow);
  return {
    generatedAt,
    inputsVersion,
    totals: summarize(matches),
    byTier: groupSlices(matches, (m) => m.tier),
    bySurface: groupSlices(matches, (m) => m.surface),
    calibration: calibration(matches),
    pending,
    settled,
  };
}

function toPickRow(m: MatchView) {
  return {
    matchId: m.id,
    slug: m.slug,
    tournament: m.tournament,
    tier: m.tier,
    surface: m.surface,
    startTime: m.startTime,
    playerA: m.playerA.name,
    playerB: m.playerB.name,
    pick: m.pick!,
    result: m.result,
    status: m.status,
  };
}

export function selectHero(matches: MatchView[]): MatchView | null {
  const tierRank: Record<string, number> = { atp: 0, wta: 1, challenger: 2, itf: 3 };
  const live = matches.filter((m) => m.status === "live" || m.status === "suspended");
  if (live.length) {
    return [...live].sort((a, b) => {
      const t = (tierRank[a.tier] ?? 9) - (tierRank[b.tier] ?? 9);
      if (t) return t;
      return (b.volume ?? 0) - (a.volume ?? 0);
    })[0]!;
  }
  const upcoming = matches
    .filter((m) => m.status === "upcoming")
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  return upcoming[0] ?? null;
}
