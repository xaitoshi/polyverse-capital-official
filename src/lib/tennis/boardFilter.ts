import type { MatchStatus, MatchView } from "./types";

/** The live board shows matches that are in play or still to be played. */
export function isBoardMatch(match: { status: MatchStatus; startTime?: string }, now = Date.now()): boolean {
  if (match.status !== "live" && match.status !== "upcoming") return false;
  if (match.status === "upcoming" && match.startTime) {
    const start = Date.parse(match.startTime);
    if (Number.isFinite(start) && now - start > 6 * 3_600_000) return false;
  }
  return true;
}

export function boardMatches<T extends { status: MatchStatus; startTime?: string }>(matches: T[], now = Date.now()): T[] {
  return matches.filter((m) => isBoardMatch(m, now));
}

export function countBoard(matches: MatchView[], now = Date.now()): { live: number; upcoming: number; hidden: number } {
  const shown = boardMatches(matches, now);
  return {
    live: shown.filter((m) => m.status === "live").length,
    upcoming: shown.filter((m) => m.status === "upcoming").length,
    hidden: matches.length - shown.length,
  };
}
