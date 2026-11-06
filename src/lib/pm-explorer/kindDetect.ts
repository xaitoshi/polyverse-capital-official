import type { MarketKind } from "./types";

/** Best-effort market kind from Gamma metadata. Unknown → other. */
export function detectMarketKind(input: {
  question?: string;
  sportsMarketType?: string | null;
  groupItemTitle?: string | null;
  outcomes?: string[];
}): MarketKind {
  const smt = (input.sportsMarketType || "").toLowerCase();
  const q = `${input.question || ""} ${input.groupItemTitle || ""}`.toLowerCase();

  if (smt.includes("moneyline") || smt.includes("match") || /\b(match winner|to win|series)\b/.test(q)) {
    if (/\bmap\s*\d|\bgame\s*\d|\bbo\d\b/.test(q) && /\bmap\b/.test(q)) return "map";
    return "series_match_winner";
  }
  if (smt.includes("spread") || smt.includes("handicap") || /[+-]\d+(\.5)?\b|\bhandicap\b|\bspread\b/.test(q)) {
    return "handicap";
  }
  if (smt.includes("map") || /\bmap\s*\d\b|\bgame\s*\d\b/.test(q)) return "map";
  if (/\bwinner\b|\bchampionship\b|\bto win (the |worlds|tournament)/.test(q)) return "futures";

  const outcomes = input.outcomes || [];
  if (outcomes.length === 2) {
    const norm = outcomes.map((o) => o.toLowerCase());
    if (norm.includes("yes") && norm.includes("no")) return "binary";
    return "binary";
  }
  if (outcomes.length > 2) return "categorical";
  return "other";
}
