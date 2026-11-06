import type { TeamIndexEntry, TierFilter } from "./types";

export function normalizeQuery(q: string): string {
  return q
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function compact(q: string): string {
  return normalizeQuery(q).replace(/\s+/g, "");
}

/** Alias-safe search: DK matches Dplus Kia (LCK) but not Challengers/Academy unless queried. */
export function searchTeams(
  teams: TeamIndexEntry[],
  query: string,
  tier: TierFilter = "all",
  limit = 25,
): TeamIndexEntry[] {
  const filtered =
    tier === "all" ? teams : teams.filter((t) => t.tier === tier);

  const nq = normalizeQuery(query);
  if (!nq) {
    return filtered
      .slice()
      .sort((a, b) => {
        if (a.tier !== b.tier) return a.tier === "majors" ? -1 : 1;
        return (b.win_rate ?? 0) - (a.win_rate ?? 0);
      })
      .slice(0, limit);
  }

  const cq = compact(query);
  const scored: { t: TeamIndexEntry; score: number }[] = [];

  for ( const t of filtered) {
    const nameN = normalizeQuery(t.name);
    const nameC = compact(t.name);
    const leagueN = normalizeQuery(t.home_league);
    const aliasN = t.aliases.map(normalizeQuery);
    const aliasC = t.aliases.map(compact);

    let score = 0;
    if (nameN === nq || aliasN.includes(nq) || nameC === cq || aliasC.includes(cq)) {
      score = 100;
    } else if (nameN.startsWith(nq) || aliasN.some((a) => a.startsWith(nq))) {
      score = 80;
    } else if (nameC.startsWith(cq) || aliasC.some((a) => a.startsWith(cq))) {
      score = 75;
    } else if (nameN.includes(nq) || aliasN.some((a) => a.includes(nq))) {
      score = 60;
    } else if (nameC.includes(cq) || aliasC.some((a) => a.includes(cq))) {
      score = 55;
    } else if (leagueN.includes(nq)) {
      score = 30;
    } else if (`${nameN} ${leagueN}`.includes(nq)) {
      score = 40;
    }

    // Prefer exact org match over Challengers/Academy when query is short alias
    if (score >= 75) {
      const isFarm =
        /challengers|academy|cl\b|youth/i.test(t.name) ||
        t.tier === "academy_erl";
      if (isFarm && cq.length <= 3 && !/challenger|academy|cl/.test(nq)) {
        score -= 15;
      }
    }

    if (score > 0) scored.push({ t, score });
  }

  scored.sort((a, b) => b.score - a.score || (b.t.win_rate ?? 0) - (a.t.win_rate ?? 0));
  return scored.slice(0, limit).map((s) => s.t);
}

export function pickDefaultTeam(teams: TeamIndexEntry[]): TeamIndexEntry | null {
  const dk = teams.find((t) => t.id === "dplus-kia-lck");
  if (dk) return dk;
  const majors = teams.filter((t) => t.tier === "majors");
  return majors[0] ?? teams[0] ?? null;
}
