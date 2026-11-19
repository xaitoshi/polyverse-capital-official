import type { MatchView, RecordTotals, Tier } from "./types";

export function dash(v: number | string | null | undefined): string {
  if (v == null || v === "") return "—";
  return String(v);
}

export function cents(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "—";
  return `${Math.round(p * 100)}¢`;
}

export function pct(p: number | null | undefined, digits = 0): string {
  if (p == null || !Number.isFinite(p)) return "—";
  return `${(p * 100).toFixed(digits)}%`;
}

export function statPct(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p)) return "—";
  return `${p.toFixed(1)}%`;
}

export function eloText(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toString();
}

export function edgeText(pp: number | null | undefined): string {
  if (pp == null || !Number.isFinite(pp)) return "—";
  const rounded = Math.round(pp);
  if (rounded === 0) return "0 pp";
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}${Math.abs(rounded)} pp`;
}

export function recordText(w: number, l: number): string {
  return `${w}–${l}`;
}

export function formText(form: { w: number; l: number } | null | undefined): string {
  if (!form || form.w + form.l === 0) return "—";
  return `${form.w}–${form.l}`;
}

export function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

export function roiText(r: number | null | undefined): string {
  if (r == null || !Number.isFinite(r)) return "—";
  const pp = r * 100;
  const sign = pp > 0.05 ? "+" : pp < -0.05 ? "−" : "";
  return `${sign}${Math.abs(pp).toFixed(1)}%`;
}

export function rateText(r: number | null | undefined): string {
  if (r == null || !Number.isFinite(r)) return "—";
  return `${(r * 100).toFixed(1)}%`;
}

export function numText(n: number | null | undefined, digits = 3): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

export function tierLabel(tier: Tier): string {
  if (tier === "atp") return "ATP";
  if (tier === "wta") return "WTA";
  if (tier === "challenger") return "CH";
  return "ITF";
}

export function rankLabel(player: { rank: number | null; rankTour: "ATP" | "WTA" | null }): string {
  if (player.rank == null) return "—";
  return `${player.rankTour ?? "Rank"} ${player.rank}`;
}

export function whenLabel(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const d = new Date(t);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  const tomorrow = new Date(now + 86_400_000).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  if (tomorrow) return `Tomorrow ${time}`;
  return d.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

export function scoreLine(m: MatchView): string {
  if (!m.sets.length) return m.scoreRaw || "—";
  return m.sets
    .map((s) => `${s.a}–${s.b}${s.tiebreak ? `(${s.tiebreak})` : ""}`)
    .join(", ");
}

export function caption(m: MatchView): string {
  if (m.status === "upcoming") return `Starts ${whenLabel(m.startTime)}`;
  if (m.status === "void") return "Voided · not counted";
  if (!m.sets.length) {
    if (m.status === "live" || m.status === "suspended") return m.status === "suspended" ? "Suspended · score not posted" : "Live · score not posted";
    return "Final · score not posted";
  }
  const last = m.sets[m.sets.length - 1]!;
  const done = m.sets.filter((s) => s.complete);
  const opener = done[0];
  if (m.status === "finished") {
    const sw = m.setsWonA === m.setsWonB ? "" : m.setsWonA > m.setsWonB ? m.playerA.name : m.playerB.name;
    return sw ? `Final · ${sw.split(" ").slice(-1)} took it ${scoreLine(m)}` : `Final · ${scoreLine(m)}`;
  }
  const setNo = m.sets.length;
  const bits = [`Set ${setNo} is ${last.a}–${last.b}`];
  if (opener && opener.complete) {
    const winner = opener.a > opener.b ? m.playerA.name : m.playerB.name;
    const hi = Math.max(opener.a, opener.b);
    const lo = Math.min(opener.a, opener.b);
    bits.push(`${winner.split(" ").slice(-1)} took the opening set ${hi}–${lo}`);
  }
  if (m.status === "suspended") bits.unshift("Suspended");
  return bits.join(" · ");
}

export function totalsLine(t: RecordTotals): string {
  if (!t.settled) return "No settled picks yet";
  return `${t.wins}–${t.losses}`;
}

export function surfaceElo(player: { hElo: number | null; cElo: number | null; gElo: number | null; elo: number | null }, surface: "Hard" | "Clay" | "Grass" | null): { label: string; value: number | null } {
  if (surface === "Hard") return { label: "Hard Elo", value: player.hElo };
  if (surface === "Clay") return { label: "Clay Elo", value: player.cElo };
  if (surface === "Grass") return { label: "Grass Elo", value: player.gElo };
  return { label: "Elo", value: player.elo };
}
