// Polymarket CLOB price history. Each Yes/No outcome has a 256-bit token ID;
// `clob.polymarket.com/prices-history` returns `{history: [{t, p}]}` where
// `t` is a unix second timestamp and `p` is the midpoint price.

export type PricePoint = {
  t: number; // unix seconds
  p: number; // 0..1
};

export async function fetchPriceHistory(
  tokenId: string,
  interval: "1h" | "6h" | "1d" | "1w" | "1m" | "max" = "1d",
  fidelity = 60
): Promise<PricePoint[]> {
  const params = new URLSearchParams({
    market: tokenId,
    interval,
    fidelity: String(fidelity),
  });
  const res = await fetch(
    `https://clob.polymarket.com/prices-history?${params}`,
    { cache: "no-store" }
  );
  if (!res.ok) throw new Error(`clob ${res.status}`);
  const data = (await res.json()) as { history?: PricePoint[] };
  return data.history ?? [];
}
