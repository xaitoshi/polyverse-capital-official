// ─── Scoring weights (tune these constants to adjust the algorithm) ───────────

export const WEIGHTS = {
  dailyRate: 25,       // max pts from daily reward rate
  spreadWidth: 20,     // max pts from max_spread (wider = easier to maintain)
  daysUntilResolution: 30, // max pts — the biggest differentiator
  minSizeInverse: 10,  // max pts — lower min size = more accessible
  lowCompetitiveness: 15,  // max pts — lower competition = better share
};

export const PENALTIES = {
  lessThan1Day: -30,
  lessThan3Days: -15,
  lessThan7Days: -5,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RewardsMarket {
  condition_id: string;
  market_id: string;
  market_slug: string;
  event_slug: string;
  question: string;
  image: string;
  market_competitiveness: number;
  rewards_config: {
    rate_per_day: number;
    start_date: string;
    end_date: string;
    asset_address: string;
    id: number;
  }[];
  rewards_max_spread: number;
  rewards_min_size: number;
  spread: number;
  tokens: { token_id: string; outcome: string; price: number }[];
  volume_24hr: number;
  end_date: string;        // raw from CLOB (may be wrong)
  resolved_end_date?: string; // enriched from Gamma (authoritative)
  daysUntilResolution?: number;
  riskScore?: number;
  scoreBreakdown?: ScoreBreakdown;
}

export interface ScoreBreakdown {
  dailyRate: number;
  spreadWidth: number;
  daysUntilResolution: number;
  minSizeInverse: number;
  lowCompetitiveness: number;
  penalty: number;
  total: number;
}

// ─── Core scoring function ────────────────────────────────────────────────────

export function calculateRiskAverseScore(market: RewardsMarket): {
  score: number;
  breakdown: ScoreBreakdown;
} {
  const dailyRate = market.rewards_config.reduce((s, r) => s + r.rate_per_day, 0);
  const days = market.daysUntilResolution ?? 0;
  const comp = market.market_competitiveness;

  // Daily rate score — log scale so $50/day doesn't dwarf $5/day
  const dailyRateScore = dailyRate <= 0
    ? 0
    : Math.min(WEIGHTS.dailyRate, (Math.log(dailyRate + 1) / Math.log(55)) * WEIGHTS.dailyRate);

  // Spread width score — wider max spread = easier to stay qualifying
  const spreadScore = Math.min(
    WEIGHTS.spreadWidth,
    (market.rewards_max_spread / 6) * WEIGHTS.spreadWidth,
  );

  // Days until resolution — the key differentiator
  let daysScore: number;
  if (days >= 90) daysScore = WEIGHTS.daysUntilResolution;
  else if (days >= 30) daysScore = WEIGHTS.daysUntilResolution * 0.80;
  else if (days >= 14) daysScore = WEIGHTS.daysUntilResolution * 0.60;
  else if (days >= 7) daysScore = WEIGHTS.daysUntilResolution * 0.40;
  else if (days >= 3) daysScore = WEIGHTS.daysUntilResolution * 0.20;
  else if (days >= 1) daysScore = WEIGHTS.daysUntilResolution * 0.05;
  else daysScore = 0;

  // Min size score — lower capital requirement = better
  const minSizeScore = market.rewards_min_size <= 20 ? WEIGHTS.minSizeInverse
    : market.rewards_min_size <= 50 ? WEIGHTS.minSizeInverse * 0.7
    : market.rewards_min_size <= 100 ? WEIGHTS.minSizeInverse * 0.4
    : market.rewards_min_size <= 200 ? WEIGHTS.minSizeInverse * 0.15
    : 0;

  // Competitiveness score — lower is better (less competition for the pot)
  const compScore = comp === 0
    ? WEIGHTS.lowCompetitiveness
    : Math.max(
        0,
        WEIGHTS.lowCompetitiveness - (Math.log(comp + 1) / Math.log(15_000_000)) * WEIGHTS.lowCompetitiveness,
      );

  // Penalties for short time until resolution
  let penalty = 0;
  if (days < 1) penalty = PENALTIES.lessThan1Day;
  else if (days < 3) penalty = PENALTIES.lessThan3Days;
  else if (days < 7) penalty = PENALTIES.lessThan7Days;

  const total = Math.max(
    0,
    Math.min(100, Math.round(dailyRateScore + spreadScore + daysScore + minSizeScore + compScore + penalty)),
  );

  return {
    score: total,
    breakdown: {
      dailyRate: Math.round(dailyRateScore),
      spreadWidth: Math.round(spreadScore),
      daysUntilResolution: Math.round(daysScore),
      minSizeInverse: Math.round(minSizeScore),
      lowCompetitiveness: Math.round(compScore),
      penalty: Math.round(penalty),
      total,
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getDaysUntilResolution(endDateStr: string): number {
  try {
    const end = new Date(endDateStr);
    const now = new Date();
    const diff = (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, diff);
  } catch {
    return 0;
  }
}

export function formatDaysLeft(days: number): string {
  if (days < 0.5) return '< 12h';
  if (days < 1) return '< 1 day';
  if (days < 2) return '1 day';
  if (days < 7) return `${Math.floor(days)}d ${Math.floor((days % 1) * 24)}h`;
  if (days < 30) return `${Math.floor(days)} days`;
  if (days < 365) return `${Math.floor(days / 30)}mo ${Math.floor(days % 30)}d`;
  return `${Math.floor(days / 365)}y+`;
}

export function daysColor(days: number): string {
  if (days < 1) return 'text-red-400';
  if (days < 7) return 'text-yellow-400';
  return 'text-blue-400';
}

export function scoreColor(score: number): string {
  if (score >= 70) return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
  if (score >= 45) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
  return 'text-red-400 bg-red-500/10 border-red-500/20';
}

// Rough estimate using market_competitiveness (used in table view, no book fetch needed)
export function estimateDailyYield(market: RewardsMarket, capital: number): number {
  const dailyRate = market.rewards_config.reduce((s, r) => s + r.rate_per_day, 0);
  const comp = market.market_competitiveness;
  if (comp === 0) return dailyRate;
  return dailyRate * (capital / (comp + capital));
}

// Accurate yield using real order book depth per side.
//
// Polymarket splits the daily reward pool equally between the YES and NO sides.
// Your share on each side = your_capital_on_that_side / (book_depth_on_that_side + your_capital).
// The user's capital is split between YES and NO bids by the `splitRatio` (0–1, default 0.5 = 50/50).
// A qualifying bid must have price ≥ token_price × (1 − max_spread/100).
export interface BookYieldResult {
  daily: number;
  yesShare: number;       // 0–1 fraction
  noShare: number;        // 0–1 fraction
  yesBookDepth: number;   // $ of qualifying YES bids already on book
  noBookDepth: number;    // $ of qualifying NO bids already on book
  yesCapital: number;     // user's YES allocation
  noCapital: number;      // user's NO allocation
}

export function estimateDailyYieldFromBook(
  dailyRate: number,
  capital: number,
  splitRatio: number,          // fraction going to YES side (0–1)
  yesBookDepth: number,
  noBookDepth: number,
): BookYieldResult {
  const yesCapital = capital * splitRatio;
  const noCapital  = capital * (1 - splitRatio);
  const halfPool   = dailyRate / 2;

  const yesShare = yesCapital === 0 ? 0 : yesCapital / (yesBookDepth + yesCapital);
  const noShare  = noCapital  === 0 ? 0 : noCapital  / (noBookDepth  + noCapital);

  const daily = halfPool * yesShare + halfPool * noShare;

  return { daily, yesShare, noShare, yesBookDepth, noBookDepth, yesCapital, noCapital };
}
