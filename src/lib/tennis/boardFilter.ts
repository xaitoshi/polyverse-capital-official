import type { BoardView, MatchStatus, MatchView } from "./types";

/** An upcoming row this late has missed its start and is not still "to be played". */
export const STALE_UPCOMING_MS = 6 * 3_600_000;

/**
 * A snapshot freezes the live flag. A tennis match that was scheduled to start
 * this long ago is not still in play, so the page drops it instead of leaving
 * yesterday's "live" rows up until the next file lands.
 */
export const STALE_SNAPSHOT_LIVE_MS = 12 * 3_600_000;

/** The live board shows matches that are in play or still to be played. */
export function isBoardMatch(
  match: { status: MatchStatus; startTime?: string },
  now = Date.now(),
  source?: BoardView["source"],
): boolean {
  if (match.status !== "live" && match.status !== "upcoming") return false;
  if (!match.startTime) return true;
  const start = Date.parse(match.startTime);
  if (!Number.isFinite(start)) return true;
  const age = now - start;
  if (match.status === "upcoming" && age > STALE_UPCOMING_MS) return false;
  if (match.status === "live" && source === "snapshot" && age > STALE_SNAPSHOT_LIVE_MS) return false;
  return true;
}

export function boardMatches<T extends { status: MatchStatus; startTime?: string }>(
  matches: T[],
  now = Date.now(),
  source?: BoardView["source"],
): T[] {
  return matches.filter((m) => isBoardMatch(m, now, source));
}

export function countBoard(
  matches: MatchView[],
  now = Date.now(),
  source?: BoardView["source"],
): { live: number; upcoming: number; hidden: number } {
  const shown = boardMatches(matches, now, source);
  return {
    live: shown.filter((m) => m.status === "live").length,
    upcoming: shown.filter((m) => m.status === "upcoming").length,
    hidden: matches.length - shown.length,
  };
}
