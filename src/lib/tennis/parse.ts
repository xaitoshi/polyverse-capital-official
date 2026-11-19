import { toIso2 } from "./countries";
import type { MatchStatus, SetScore, Side, Surface, Tour } from "./types";

const IN_PLAY = new Set(["S1", "S2", "S3", "S4", "S5", "LIVE"]);

export interface RawTeam {
  name?: string;
  logo?: string;
  ordering?: string;
  abbreviation?: string;
}

export interface RawMarket {
  sportsMarketType?: string | null;
  outcomes?: string;
  outcomePrices?: string;
  bestBid?: number | null;
  bestAsk?: number | null;
  lastTradePrice?: number | null;
  volume?: string | number | null;
  closed?: boolean;
  question?: string;
}

export interface RawEvent {
  id?: string | number;
  slug?: string;
  title?: string;
  description?: string;
  startTime?: string;
  period?: string | null;
  score?: string | null;
  live?: boolean | null;
  ended?: boolean | null;
  closed?: boolean;
  sport?: { sport?: string } | string | null;
  teams?: RawTeam[];
  markets?: RawMarket[];
  series?: { id?: string } | string | null;
  server?: string | null;
  serving?: string | null;
}

export function eventTour(ev: RawEvent): Tour | null {
  const sport = typeof ev.sport === "string" ? ev.sport : ev.sport?.sport;
  if (sport === "atp" || sport === "wta" || sport === "itf") return sport;
  const slug = ev.slug ?? "";
  if (slug.startsWith("atp-")) return "atp";
  if (slug.startsWith("wta-")) return "wta";
  if (slug.startsWith("itf-")) return "itf";
  return null;
}

export function isDoublesEvent(ev: RawEvent): boolean {
  const sport = typeof ev.sport === "string" ? ev.sport : ev.sport?.sport || "";
  if (sport.includes("doubles")) return true;
  const blob = `${ev.slug ?? ""} ${ev.title ?? ""}`.toLowerCase();
  return blob.includes("doubles");
}

export function parseJsonArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function parseNumArray(raw: unknown): number[] {
  return parseJsonArray(raw)
    .map((s) => Number(s))
    .map((n) => (Number.isFinite(n) ? n : NaN));
}

export function moneyline(ev: RawEvent): RawMarket | null {
  const markets = ev.markets ?? [];
  return markets.find((m) => m.sportsMarketType === "moneyline") ?? null;
}

/**
 * Prices aligned to `outcomes` order.
 * A two-sided book (bestBid/bestAsk on the first outcome) becomes the mid and its complement.
 * Otherwise the posted outcomePrices are used. Missing stays null.
 */
export function outcomeMids(market: RawMarket): { names: string[]; prices: (number | null)[] } {
  const names = parseJsonArray(market.outcomes);
  const posted = parseNumArray(market.outcomePrices);
  const bid = typeof market.bestBid === "number" ? market.bestBid : null;
  const ask = typeof market.bestAsk === "number" ? market.bestAsk : null;
  if (
    names.length >= 2 &&
    bid != null &&
    ask != null &&
    bid >= 0 &&
    ask <= 1 &&
    ask >= bid &&
    ask - bid <= 0.2
  ) {
    const mid = (bid + ask) / 2;
    return { names, prices: [clamp01(mid), clamp01(1 - mid)] };
  }
  const prices = names.map((_, i) => {
    const n = posted[i];
    return n != null && Number.isFinite(n) ? clamp01(n) : null;
  });
  return { names, prices };
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function setComplete(a: number, b: number): boolean {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi >= 6 && hi - lo >= 2) return true;
  if (hi === 7 && lo === 6) return true;
  return false;
}

export function parseSets(score: string | null | undefined): SetScore[] {
  if (!score) return [];
  const parts = score.split(",").map((s) => s.trim()).filter(Boolean);
  const out: SetScore[] = [];
  for (const part of parts) {
    const m = part.match(/(\d+)\s*[-–]\s*(\d+)(?:\s*\(([^)]+)\))?/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    out.push({ a, b, tiebreak: m[3] ?? null, complete: setComplete(a, b) });
  }
  return out;
}

export function setsWon(sets: SetScore[], status: MatchStatus): { a: number; b: number } {
  const countable = status === "finished" ? sets.filter((s) => s.complete) : sets.filter((s) => s.complete);
  let a = 0;
  let b = 0;
  for (const s of countable) {
    if (s.a > s.b) a += 1;
    else if (s.b > s.a) b += 1;
  }
  return { a, b };
}

/**
 * Keep matches that are actually on the board.
 * Stale closed=false events (start well in the past, finished or never went live) drop out.
 * `now` is epoch ms.
 */
export function classifyEvent(ev: RawEvent, nowMs: number): MatchStatus | "ignore" {
  const tour = eventTour(ev);
  if (!tour || isDoublesEvent(ev)) return "ignore";
  if (!moneyline(ev)) return "ignore";
  const start = ev.startTime ? Date.parse(ev.startTime) : NaN;
  if (!Number.isFinite(start)) return "ignore";
  const ageH = (nowMs - start) / 3_600_000;
  const period = (ev.period || "").toUpperCase();

  // Gamma sometimes leaves a set period up after the match is over.
  if (ev.ended === true) {
    if (ageH < 36 && ageH > -2) return "finished";
    return "ignore";
  }
  if (period === "FT") {
    if (ageH >= -1 && ageH < 30) return "finished";
    return "ignore";
  }
  if (period === "CANC" || period === "VOID" || period === "RET") {
    if (ageH < 48 && ageH > -6) return "void";
    return "ignore";
  }
  if (period === "SUS") {
    if (ageH < 36 && ageH > -2) return "suspended";
    return "ignore";
  }
  if (IN_PLAY.has(period) || ev.live === true) {
    if (ageH < 30 && ageH > -3) return "live";
    return "ignore";
  }
  if (period === "POST") {
    if (ageH < 0 && ageH > -24 * 10) return "upcoming";
    return "ignore";
  }
  // Not started, or gamma has not posted a period.
  if (ageH < 0 && ageH > -24 * 10) return "upcoming";
  // A start a couple of hours ago with no period is a delay, not a live match.
  if (ageH >= 0 && ageH < 2) return "upcoming";
  return "ignore";
}

export function tournamentFromTitle(title: string): { tournament: string; playersHint: string } {
  const idx = title.lastIndexOf(":");
  if (idx === -1) return { tournament: title.trim(), playersHint: title };
  return { tournament: title.slice(0, idx).trim(), playersHint: title.slice(idx + 1).trim() };
}

export function itfLevel(title: string): string | null {
  const m = title.match(/\b([MW]\d{2,3})\b/);
  return m ? m[1]! : null;
}

export function surfaceFromText(text: string | null | undefined): Surface | null {
  if (!text) return null;
  if (/\bgrass\b/i.test(text)) return "Grass";
  if (/\bclay\b/i.test(text)) return "Clay";
  if (/\bhard\b/i.test(text)) return "Hard";
  return null;
}

export function countryFromFlagUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/country-flags\/([a-z]{2,3})\.png/i) || url.match(/countries\/500\/([a-z]{2,3})\.png/i);
  if (!m) return null;
  const code = m[1]!.toLowerCase();
  if (code === "un") return null;
  return toIso2(code);
}

export function serverSide(ev: RawEvent, nameA: string, nameB: string): Side | null {
  const raw = (ev.server || ev.serving || "").trim();
  if (!raw) return null;
  const n = raw.toLowerCase();
  if (n === "home" || n === "a" || n === "0") return "a";
  if (n === "away" || n === "b" || n === "1") return "b";
  if (nameA && n.includes(nameA.toLowerCase())) return "a";
  if (nameB && n.includes(nameB.toLowerCase())) return "b";
  return null;
}

export function volumeOf(market: RawMarket): number | null {
  const n = typeof market.volume === "number" ? market.volume : Number(market.volume);
  return Number.isFinite(n) ? n : null;
}
