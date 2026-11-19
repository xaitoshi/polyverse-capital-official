import {
  SKILL_FORM_GAP,
  SKILL_MIN_ELO_GAP,
  SKILL_MIN_RANK_GAP,
  SKILL_MIN_SAMPLE,
  SKILL_RANK_RATIO,
  SKILL_SERVE_WON_GAP,
} from "./methodology";
import type { PlayerSummary, Side, Surface } from "./types";

export interface SkillGap {
  side: Side;
  playerName: string;
  /** Short reason for the badge tooltip. Uses only numbers that were present. */
  note: string;
}

function placementSide(
  a: PlayerSummary,
  b: PlayerSummary,
  surface: Surface | null,
): { side: Side; note: string } | null {
  let rankSide: Side | null = null;
  let rankNote = "";
  if (a.rank != null && b.rank != null && a.rank !== b.rank) {
    const side: Side = a.rank < b.rank ? "a" : "b";
    const better = side === "a" ? a.rank : b.rank;
    const worse = side === "a" ? b.rank : a.rank;
    if (better <= worse * SKILL_RANK_RATIO && worse - better >= SKILL_MIN_RANK_GAP) {
      rankSide = side;
      rankNote = `#${better} vs #${worse}`;
    }
  }

  const elo = (p: PlayerSummary): number | null => {
    if (surface === "Hard" && p.hElo != null) return p.hElo;
    if (surface === "Clay" && p.cElo != null) return p.cElo;
    if (surface === "Grass" && p.gElo != null) return p.gElo;
    return p.elo;
  };
  const ea = elo(a);
  const eb = elo(b);
  let eloSide: Side | null = null;
  let eloNote = "";
  if (ea != null && eb != null && Math.abs(ea - eb) >= SKILL_MIN_ELO_GAP) {
    eloSide = ea > eb ? "a" : "b";
    const label = surface === "Hard" && a.hElo != null && b.hElo != null
      ? "hard Elo"
      : surface === "Clay" && a.cElo != null && b.cElo != null
        ? "clay Elo"
        : surface === "Grass" && a.gElo != null && b.gElo != null
          ? "grass Elo"
          : "Elo";
    const hi = eloSide === "a" ? ea : eb;
    const lo = eloSide === "a" ? eb : ea;
    eloNote = `${label} ${Math.round(hi)} vs ${Math.round(lo)}`;
  }

  if (rankSide && eloSide && rankSide !== eloSide) return null;
  const side = rankSide ?? eloSide;
  if (!side) return null;
  return { side, note: [rankNote, eloNote].filter(Boolean).join(", ") };
}

function resultsSide(a: PlayerSummary, b: PlayerSummary): { side: Side; note: string } | null {
  const af = a.form;
  const bf = b.form;
  if (af && bf && af.n >= SKILL_MIN_SAMPLE && bf.n >= SKILL_MIN_SAMPLE) {
    const aw = af.w / af.n;
    const bw = bf.w / bf.n;
    if (Math.abs(aw - bw) < SKILL_FORM_GAP) return null;
    const side: Side = aw > bw ? "a" : "b";
    const bwins = side === "a" ? af : bf;
    const lwins = side === "a" ? bf : af;
    return { side, note: `form ${bwins.w}–${bwins.l} vs ${lwins.w}–${lwins.l}` };
  }

  const as = a.serve;
  const bs = b.serve;
  if (
    as && bs &&
    as.sample >= SKILL_MIN_SAMPLE &&
    bs.sample >= SKILL_MIN_SAMPLE &&
    as.firstWonPct != null &&
    bs.firstWonPct != null &&
    Math.abs(as.firstWonPct - bs.firstWonPct) >= SKILL_SERVE_WON_GAP
  ) {
    const side: Side = as.firstWonPct > bs.firstWonPct ? "a" : "b";
    const hi = side === "a" ? as.firstWonPct : bs.firstWonPct;
    const lo = side === "a" ? bs.firstWonPct : as.firstWonPct;
    return {
      side,
      note: `1st serve won ${hi.toFixed(0)}% vs ${lo.toFixed(0)}%`,
    };
  }
  return null;
}

/** Null when either criterion is missing or the two criteria name different players. */
export function skillGap(match: {
  playerA: PlayerSummary;
  playerB: PlayerSummary;
  surface: Surface | null;
}): SkillGap | null {
  const place = placementSide(match.playerA, match.playerB, match.surface);
  const results = resultsSide(match.playerA, match.playerB);
  if (!place || !results || place.side !== results.side) return null;
  const player = place.side === "a" ? match.playerA : match.playerB;
  return {
    side: place.side,
    playerName: player.name,
    note: [place.note, results.note].filter(Boolean).join(", "),
  };
}
