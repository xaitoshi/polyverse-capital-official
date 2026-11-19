/**
 * Pluggable tennis data providers.
 *
 * v1 ships the free stack (ESPN rankings, Tennis Abstract, Wikimedia, Polymarket).
 * A paid api-tennis.com provider can be constructed when `API_TENNIS_KEY` is set.
 * It is not called by the free path. No stats are synthesised if a provider returns nothing.
 */

export interface ProviderRanking {
  tour: "atp" | "wta";
  rank: number;
  name: string;
  countryCode: string | null;
  countryName: string | null;
  flagUrl: string | null;
  asOf: string | null;
}

export interface ProviderElo {
  tour: "atp" | "wta";
  name: string;
  slug: string;
  elo: number;
  hElo: number | null;
  cElo: number | null;
  gElo: number | null;
  updated: string | null;
}

export interface ProviderRecentMatch {
  date: string;
  tournament: string;
  surface: "Hard" | "Clay" | "Grass" | null;
  round: string | null;
  rank: number | null;
  opponent: string;
  result: "W" | "L" | "unplayed";
  score: string | null;
  acePct: number | null;
  dfPct: number | null;
  firstInPct: number | null;
  firstWonPct: number | null;
  secondWonPct: number | null;
  bpSavedPct: number | null;
}

export interface TennisDataProvider {
  readonly id: string;
  rankings(tour: "atp" | "wta"): Promise<ProviderRanking[]>;
  elo(tour: "atp" | "wta"): Promise<ProviderElo[]>;
  recent(playerSlug: string): Promise<ProviderRecentMatch[]>;
}

export class ProviderNotConfigured extends Error {
  constructor(id: string) {
    super(`${id} is not configured`);
    this.name = "ProviderNotConfigured";
  }
}

/**
 * api-tennis.com (https://api.tennis-data or api-tennis.com) — paid.
 * The key is read from the environment at call time. Without it every method throws
 * ProviderNotConfigured and the caller keeps the free-stack result.
 *
 * Endpoint paths are intentionally not guessed here. Wire them when a key exists
 * and the vendor docs are checked; do not invent fixtures.
 */
export class ApiTennisProvider implements TennisDataProvider {
  readonly id = "api-tennis.com";

  constructor(private readonly apiKey: string | undefined = process.env.API_TENNIS_KEY) {}

  private key(): string {
    const k = this.apiKey?.trim();
    if (!k) throw new ProviderNotConfigured(this.id);
    return k;
  }

  async rankings(): Promise<ProviderRanking[]> {
    this.key();
    throw new Error("api-tennis.com rankings adapter is not wired in v1");
  }

  async elo(): Promise<ProviderElo[]> {
    this.key();
    throw new Error("api-tennis.com does not replace Tennis Abstract Elo in v1");
  }

  async recent(): Promise<ProviderRecentMatch[]> {
    this.key();
    throw new Error("api-tennis.com recent-match adapter is not wired in v1");
  }
}

export function paidProviderIfConfigured(): ApiTennisProvider | null {
  if (!process.env.API_TENNIS_KEY?.trim()) return null;
  return new ApiTennisProvider(process.env.API_TENNIS_KEY);
}
