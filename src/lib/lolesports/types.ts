export type TierFilter = "all" | "majors" | "academy_erl";

export interface TeamIndexEntry {
  id: string;
  name: string;
  aliases: string[];
  home_league: string;
  tier: "majors" | "academy_erl" | string;
  wins: number;
  losses: number;
  win_rate: number | null;
  strength_grade: string | null;
  drafting_grade: string | null;
  power_rank: number | null;
  power_of: number | null;
  games: number;
}

export interface LolesportsIndex {
  meta: {
    scoring_version: string;
    coverage: {
      start: string;
      end: string;
      detailed_stats_through?: string;
      detailed_stats_through_full?: string;
      match_results_through?: string;
      season_year: number;
      season_start: string;
      honest_cutoff: boolean;
      timezone_note?: string;
      refresh: string;
      refresh_attempt?: Record<string, unknown>;
    };
    counts: Record<string, number>;
    min_samples: Record<string, number>;
    provenance: Record<string, unknown>;
  };
  teams: TeamIndexEntry[];
}

export interface ChampRef {
  champion: string;
  cdn?: string | null;
  games?: number;
  w?: number;
  l?: number;
  role?: string;
  role_share?: number;
  global_role_games?: number;
  ringed?: boolean;
  team_share?: number;
}

export interface StrengthWeakness {
  metric: string;
  label: string;
  percentile: number;
  kind: "strength" | "weakness";
}

export interface RosterPlayer {
  role: string;
  role_label: string;
  player: string;
  games: number;
  kda: number | null;
  pool: number;
  most_played: ChampRef[];
  rating: number | null;
  laning: number | null;
  gd15: number | null;
  gd15_pct: number | null;
  strengths: StrengthWeakness[];
  weaknesses: StrengthWeakness[];
  confidence: string;
  peer_scope: string;
  off_meta: ChampRef[];
}

export interface TeamCard {
  id: string;
  name: string;
  aliases: string[];
  home_league: string;
  tier: string;
  scoring_version: string;
  window: Record<string, unknown>;
  provenance: Record<string, unknown>;
  grades: {
    strength: string | null;
    drafting: string | null;
    strength_basis: string;
    drafting_basis: string;
  };
  kpis: {
    record: { wins: number; losses: number; games: number; win_rate: number | null };
    international: {
      wins: number;
      losses: number;
      by_event: { league: string; w: number; l: number }[];
      note: string;
    };
    golddiffat15: { mean: number | null; n: number };
    power_rank: { rank: number | null; of: number | null; scope: string; metric: string };
  };
  summary: string;
  best_player: { player: string; role: string; rating: number | null } | null;
  roster: RosterPlayer[];
  drafting: {
    grade: string | null;
    season_rank: { rank: number | null; of: number | null; scope: string };
    recent_rank: { rank: number | null; of: number | null; scope: string };
    season_proxy: { n: number; residual_mean: number | null; label: string; note: string };
    recent_proxy: { n: number; residual_mean: number | null; label: string; note: string };
    signature_picks: ChampRef[];
    analysis: string;
  };
  side_pick_order: {
    rows: Record<string, Record<string, { w: number; l: number; n: number }>>;
    summary: {
      blue_wr: number | null;
      red_wr: number | null;
      first_pick_wr: number | null;
      second_pick_wr: number | null;
      n: number;
    };
  };
  off_meta_definition: { rule: string; ringed: string };
  gaps: string[];
}

export interface MethodologyDoc {
  scoring_version: string;
  title: string;
  not_copied: string;
  formulas: Record<string, string>;
  grade_thresholds: Record<string, number>;
}
