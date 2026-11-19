import type { MatchView, Tier } from "./types";

export interface CoverageRow {
  tier: Tier | "all";
  players: number;
  country: number;
  photo: number;
  rank: number;
  elo: number;
  form: number;
  serve: number;
}

function pct(n: number, d: number): number {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

export interface CoverageReport {
  generatedAt: string;
  /** Unique players on the live/upcoming board, split by the tier of a match they are in. */
  rows: (CoverageRow & { countryPct: number; photoPct: number; rankPct: number; eloPct: number; formPct: number; servePct: number })[];
}

const TIERS: Tier[] = ["atp", "wta", "challenger", "itf"];

export function coverageReport(matches: MatchView[], generatedAt: string): CoverageReport {
  const buckets = new Map<string, Map<string, MatchView["playerA"]>>();
  const all = new Map<string, MatchView["playerA"]>();
  for (const tier of TIERS) buckets.set(tier, new Map());
  for (const m of matches) {
    for (const p of [m.playerA, m.playerB]) {
      buckets.get(m.tier)?.set(p.id, p);
      if (!all.has(p.id)) all.set(p.id, p);
    }
  }
  const row = (tier: Tier | "all", players: Map<string, MatchView["playerA"]>) => {
    const list = [...players.values()];
    const base: CoverageRow = {
      tier,
      players: list.length,
      country: list.filter((p) => p.countryCode).length,
      photo: list.filter((p) => p.photo?.url).length,
      rank: list.filter((p) => p.rank != null).length,
      elo: list.filter((p) => p.elo != null).length,
      form: list.filter((p) => p.form && p.form.n > 0).length,
      serve: list.filter((p) => p.serve && p.serve.sample > 0).length,
    };
    return {
      ...base,
      countryPct: pct(base.country, base.players),
      photoPct: pct(base.photo, base.players),
      rankPct: pct(base.rank, base.players),
      eloPct: pct(base.elo, base.players),
      formPct: pct(base.form, base.players),
      servePct: pct(base.serve, base.players),
    };
  };
  return {
    generatedAt,
    rows: [row("all", all), ...TIERS.map((t) => row(t, buckets.get(t)!))],
  };
}
