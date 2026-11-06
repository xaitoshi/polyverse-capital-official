import { ADAPTER_VERSIONS } from "../config";
import type { BookLevel, OrderBookSnapshot } from "../types";

export const version = ADAPTER_VERSIONS.clobBook;
const CLOB = "/api/clob";

function mapLevels(raw: unknown): BookLevel[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const r = row as { price?: string | number; size?: string | number };
      return {
        price: Number(r.price),
        sizeShares: Number(r.size),
      };
    })
    .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.sizeShares));
}

export async function getBook(
  tokenId: string,
  signal?: AbortSignal
): Promise<OrderBookSnapshot | { unavailable: true; reason: string }> {
  try {
    const params = new URLSearchParams({ token_id: tokenId });
    const res = await fetch(`${CLOB}/book?${params}`, { signal, cache: "no-store" });
    if (!res.ok) return { unavailable: true, reason: `clob book ${res.status}` };
    const data = (await res.json()) as {
      timestamp?: string | number;
      bids?: unknown;
      asks?: unknown;
    };
    const bids = mapLevels(data.bids).sort((a, b) => b.price - a.price);
    const asks = mapLevels(data.asks).sort((a, b) => a.price - b.price);
    const bestBid = bids[0]?.price;
    const bestAsk = asks[0]?.price;
    const asOf =
      typeof data.timestamp === "number"
        ? new Date(data.timestamp > 1e12 ? data.timestamp : Number(data.timestamp) * 1000).toISOString()
        : typeof data.timestamp === "string" && data.timestamp
          ? new Date(Number(data.timestamp) || data.timestamp).toISOString()
          : new Date().toISOString();
    return {
      asOf: Number.isNaN(Date.parse(asOf)) ? new Date().toISOString() : asOf,
      tokenId,
      bids,
      asks,
      bestBid,
      bestAsk,
      spread:
        bestBid != null && bestAsk != null && Number.isFinite(bestBid) && Number.isFinite(bestAsk)
          ? bestAsk - bestBid
          : undefined,
    };
  } catch (e) {
    return { unavailable: true, reason: String((e as Error).message || e) };
  }
}

export function assertClobBookShape(payload: unknown): void {
  if (!payload || typeof payload !== "object") throw new Error("clobBookV1 drift: not object");
  const o = payload as Record<string, unknown>;
  if (o.bids != null && !Array.isArray(o.bids)) throw new Error("clobBookV1 drift: bids");
  if (o.asks != null && !Array.isArray(o.asks)) throw new Error("clobBookV1 drift: asks");
}
