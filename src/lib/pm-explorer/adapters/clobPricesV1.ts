import { ADAPTER_VERSIONS } from "../config";
import { unixToIso } from "../format";
import type { PricePoint, Provenance } from "../types";

export const version = ADAPTER_VERSIONS.clobPrices;
const CLOB = "/api/clob";

export type ClobInterval = "1h" | "6h" | "1d" | "1w" | "1m" | "max";

export async function getPrices(
  tokenId: string,
  interval: ClobInterval = "1w",
  fidelity = 60,
  signal?: AbortSignal
): Promise<{ points: PricePoint[]; provenance: Provenance }> {
  const params = new URLSearchParams({
    market: tokenId,
    interval,
    fidelity: String(fidelity),
  });
  const res = await fetch(`${CLOB}/prices-history?${params}`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`clob prices-history ${res.status}`);
  const data = (await res.json()) as { history?: { t: number; p: number }[] };
  const history = Array.isArray(data.history) ? data.history : [];
  const points: PricePoint[] = history
    .filter((h) => Number.isFinite(h.t) && Number.isFinite(h.p))
    .map((h) => ({
      ts: unixToIso(h.t),
      tokenId,
      price: h.p,
      source: "clob.prices-history",
    }));
  return {
    points,
    provenance: {
      asOf: new Date().toISOString(),
      sources: ["clob.polymarket.com/prices-history"],
      completeness: points.length ? "full" : "unknown",
      warnings: points.length ? [] : ["No price history for token"],
      adapterVersions: { clobPrices: version },
    },
  };
}

export function assertClobHistoryShape(payload: unknown): void {
  if (!payload || typeof payload !== "object") throw new Error("clobPricesV1 drift: not object");
  const hist = (payload as { history?: unknown }).history;
  if (hist != null && !Array.isArray(hist)) throw new Error("clobPricesV1 drift: history not array");
  if (Array.isArray(hist) && hist[0]) {
    const row = hist[0] as Record<string, unknown>;
    if (typeof row.t !== "number" || typeof row.p !== "number") {
      throw new Error("clobPricesV1 drift: history row missing t/p numbers");
    }
  }
}
