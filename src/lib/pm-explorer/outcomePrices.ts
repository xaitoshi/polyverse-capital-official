/**
 * Per-outcome display price from Gamma market fields.
 * NEVER broadcast market-level `lastTradePrice` / bestBid / bestAsk onto every outcome —
 * those fields describe one side of the book (usually token 0), which caused both chips
 * to show e.g. 18¢ while depth correctly showed T1 ~82¢.
 */
export function resolveOutcomeLastPrice(
  outcomeIndex: number,
  outcomePrices: number[],
  _marketLastTradePrice?: number
): number | undefined {
  const p = outcomePrices[outcomeIndex];
  if (Number.isFinite(p)) return p;
  return undefined;
}

export function resolveOutcomeBookSide(
  outcomeIndex: number,
  side: "bid" | "ask",
  marketBestBid?: number,
  marketBestAsk?: number
): number | undefined {
  // Gamma market bestBid/bestAsk apply to the primary (index 0) token only.
  if (outcomeIndex !== 0) return undefined;
  const v = side === "bid" ? marketBestBid : marketBestAsk;
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
