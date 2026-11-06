import type { PricePoint, Provenance, TradePoint } from "../types";

const base = Date.parse("2026-11-04T12:00:00.000Z");
const TOKEN = "tok-t1";
const OTHER = "tok-kc";

function px(offsetMin: number, price: number, tokenId = TOKEN): PricePoint {
  return {
    ts: new Date(base + offsetMin * 60_000).toISOString(),
    tokenId,
    price,
    source: "fixture",
  };
}

function tr(
  offsetMin: number,
  side: "BUY" | "SELL",
  notional: number,
  tokenId = TOKEN
): TradePoint {
  const price = 0.8;
  const size = notional / price;
  return {
    id: `fx-${offsetMin}-${side}-${notional}`,
    ts: new Date(base + offsetMin * 60_000).toISOString(),
    tokenId,
    side,
    price,
    sizeShares: size,
    notionalUsdc: notional,
    wallet: `0xwallet${Math.floor(offsetMin)}`,
  };
}

/** Sparse ticks (~15m gap): rise 80→85 then revert to 80; buys during rise. */
export const FIXTURE_REVERT_RISE = {
  tokenId: TOKEN,
  outcomeLabel: "T1",
  prices: [
    px(0, 0.8),
    px(15, 0.8),
    px(30, 0.82),
    px(45, 0.85), // peak
    px(60, 0.83),
    px(75, 0.8), // reverted
    px(90, 0.8),
    // other outcome present but must be ignored for T1 moves
    px(0, 0.2, OTHER),
    px(45, 0.15, OTHER),
  ] as PricePoint[],
  trades: [
    tr(20, "BUY", 500),
    tr(35, "BUY", 2000), // during rise
    tr(40, "BUY", 1500),
    tr(50, "SELL", 800), // after peak / during revert
    tr(35, "BUY", 900, OTHER), // wrong outcome — must not mix
  ] as TradePoint[],
  provenance: {
    asOf: new Date().toISOString(),
    sources: ["fixture"],
    completeness: "full" as const,
    warnings: [],
    adapterVersions: {},
  } satisfies Provenance,
};

/** Sustained rise with truncated trade sample warning. */
export const FIXTURE_TRUNCATED_TRADES = {
  tokenId: TOKEN,
  outcomeLabel: "T1",
  prices: [
    px(0, 0.5),
    px(10, 0.5),
    px(20, 0.55),
    px(30, 0.6),
    px(40, 0.65),
    px(50, 0.7),
    px(60, 0.72),
    px(70, 0.73),
  ] as PricePoint[],
  trades: [tr(25, "BUY", 3000), tr(28, "BUY", 1000)] as TradePoint[],
  provenance: {
    asOf: new Date().toISOString(),
    sources: ["fixture"],
    completeness: "truncated" as const,
    warnings: ["Trade history truncated after 800 rows"],
    adapterVersions: {},
  } satisfies Provenance,
};

/** Right-edge move: last ticks form a jump with no later observations. */
export const FIXTURE_RIGHT_EDGE = {
  tokenId: TOKEN,
  outcomeLabel: "T1",
  prices: [
    px(0, 0.4),
    px(15, 0.4),
    px(30, 0.4),
    px(45, 0.41),
    px(60, 0.42),
    px(75, 0.5), // jump at right edge — no later ticks
  ] as PricePoint[],
  trades: [] as TradePoint[],
  provenance: {
    asOf: new Date().toISOString(),
    sources: ["fixture"],
    completeness: "full" as const,
    warnings: [],
    adapterVersions: {},
  } satisfies Provenance,
};
