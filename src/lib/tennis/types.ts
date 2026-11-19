/** Shared shapes for the tennis book. Missing stats stay null and render as "—". */

export type Tour = "atp" | "wta" | "itf";
export type Tier = "atp" | "wta" | "challenger" | "itf";
export type MatchStatus = "live" | "upcoming" | "finished" | "void" | "suspended";
export type Confidence = "low" | "medium" | "high";
export type Coverage = "elo" | "mixed" | "rank" | "market" | "none";
export type Side = "a" | "b";
export type Surface = "Hard" | "Clay" | "Grass";

export interface PhotoCredit {
  url: string;
  pageUrl: string | null;
  license: string | null;
  attribution: string | null;
  source: "wikimedia";
}

export interface PlayerSummary {
  id: string;
  name: string;
  countryCode: string | null;
  countryName: string | null;
  flagUrl: string | null;
  rank: number | null;
  rankTour: "ATP" | "WTA" | null;
  rankSource: string | null;
  elo: number | null;
  hElo: number | null;
  cElo: number | null;
  gElo: number | null;
  eloSource: string | null;
  photo: PhotoCredit | null;
  form: { w: number; l: number; n: number } | null;
  serve: ServeLine | null;
  /** Recent-window meetings vs the opponent, not a career H2H. */
  recentH2h: { w: number; l: number; n: number } | null;
}

export interface ServeLine {
  sample: number;
  acePct: number | null;
  dfPct: number | null;
  firstInPct: number | null;
  firstWonPct: number | null;
  secondWonPct: number | null;
  bpSavedPct: number | null;
  source: string;
}

export interface RecentRow {
  date: string;
  tournament: string;
  surface: Surface | null;
  round: string | null;
  rank: number | null;
  opponent: string;
  opponentId: string | null;
  result: "W" | "L" | "unplayed";
  score: string | null;
  acePct: number | null;
  dfPct: number | null;
  firstInPct: number | null;
  firstWonPct: number | null;
}

export interface LockedPick {
  pickedAt: string;
  side: Side;
  playerId: string;
  playerName: string;
  modelProb: number;
  marketPrice: number | null;
  edgePp: number | null;
  value: boolean;
  confidence: Confidence;
  coverage: Coverage;
  inputsVersion: string;
  /** Ratings actually used. Null means that input was absent, not zero. */
  inputs: {
    ratingA: number | null;
    ratingB: number | null;
    ratingKindA: "surface-elo" | "overall-elo" | "rank-prior" | "none";
    ratingKindB: "surface-elo" | "overall-elo" | "rank-prior" | "none";
    surface: Surface | null;
    formAdjA: number;
    formAdjB: number;
    serveAdjA: number;
    rankPullA: number;
    rankPullB: number;
  };
}

export interface SetScore {
  a: number;
  b: number;
  tiebreak: string | null;
  complete: boolean;
}

export interface MatchView {
  id: string;
  slug: string;
  title: string;
  tour: Tour;
  tier: Tier;
  /** Level token taken from the source title or tournament file, e.g. M15, 125, Finals. */
  level: string | null;
  tournament: string;
  round: string | null;
  surface: Surface | null;
  surfaceSource: string | null;
  startTime: string;
  period: string | null;
  scoreRaw: string | null;
  sets: SetScore[];
  setsWonA: number;
  setsWonB: number;
  server: Side | null;
  status: MatchStatus;
  playerA: PlayerSummary;
  playerB: PlayerSummary;
  priceA: number | null;
  priceB: number | null;
  volume: number | null;
  marketClosed: boolean;
  polymarketUrl: string;
  pick: LockedPick | null;
  result: SettledResult | null;
}

export interface SettledResult {
  settledAt: string;
  kind: "winner" | "void";
  winnerSide: Side | null;
  source: string;
  pickWon: boolean | null;
  pnlFlat1u: number | null;
  brier: number | null;
  logLoss: number | null;
}

export interface RecordTotals {
  settled: number;
  wins: number;
  losses: number;
  voids: number;
  pending: number;
  winRate: number | null;
  valueWins: number;
  valueLosses: number;
  valueSettled: number;
  roi: number | null;
  brier: number | null;
  logLoss: number | null;
  stake: "flat 1u at the pick-time price";
}

export interface RecordSlice {
  key: string;
  settled: number;
  wins: number;
  losses: number;
  winRate: number | null;
  roi: number | null;
  brier: number | null;
}

export interface CalibrationBin {
  from: number;
  to: number;
  n: number;
  meanProb: number | null;
  freq: number | null;
}

export interface RecordView {
  generatedAt: string;
  inputsVersion: string;
  totals: RecordTotals;
  byTier: RecordSlice[];
  bySurface: RecordSlice[];
  calibration: CalibrationBin[];
  pending: PickRow[];
  settled: PickRow[];
}

export interface PickRow {
  matchId: string;
  slug: string;
  tournament: string;
  tier: Tier;
  surface: Surface | null;
  startTime: string;
  playerA: string;
  playerB: string;
  pick: LockedPick;
  result: SettledResult | null;
  status: MatchStatus;
}

export interface BoardView {
  generatedAt: string;
  inputsVersion: string;
  source: "snapshot" | "postgres" | "unconfigured";
  matches: MatchView[];
  record: RecordTotals;
  sources: Record<string, string>;
  notes: string[];
}

export interface PlayerProfile {
  player: PlayerSummary;
  recent: RecentRow[];
  picks: PickRow[];
  generatedAt: string;
}
