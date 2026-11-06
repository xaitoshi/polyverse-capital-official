import { ADAPTER_VERSIONS, TRADE_MAX_PAGES, TRADE_PAGE_LIMIT } from "../config";
import { unixToIso } from "../format";
import type { Provenance, TradePoint } from "../types";

export const version = ADAPTER_VERSIONS.dataTrades;
/** Proxied to data-api.polymarket.com — must use /v2/ (v1 returns 410). */
const DATA = "/api/poly-data";

export interface RawTradeV2 {
  proxy_wallet?: string;
  side?: string;
  token_id?: string;
  condition_id?: string;
  size?: number;
  price?: number;
  timestamp?: number;
  title?: string;
  outcome?: string;
  name?: string;
  transaction_hash?: string;
  outcome_index?: number;
}

export interface TradesPage {
  trades: TradePoint[];
  nextCursor?: string;
  hasMore: boolean;
  provenance: Provenance;
}

function mapTrade(row: RawTradeV2): TradePoint | null {
  const tokenId = String(row.token_id || "");
  const wallet = String(row.proxy_wallet || "").toLowerCase();
  const price = Number(row.price);
  const size = Number(row.size);
  const ts = Number(row.timestamp);
  if (!tokenId || !wallet || !Number.isFinite(price) || !Number.isFinite(size) || !Number.isFinite(ts)) {
    return null;
  }
  const side = String(row.side || "").toUpperCase() === "SELL" ? "SELL" : "BUY";
  const tx = row.transaction_hash ? String(row.transaction_hash) : undefined;
  return {
    id: tx ? `${tx}:${tokenId}:${ts}:${side}:${size}` : `${wallet}:${tokenId}:${ts}:${side}:${size}`,
    ts: unixToIso(ts),
    tokenId,
    side,
    price,
    sizeShares: size,
    notionalUsdc: Math.abs(price * size),
    wallet,
    walletName: row.name ? String(row.name) : undefined,
    outcomeLabel: row.outcome ? String(row.outcome) : undefined,
    txHash: tx,
    orderType: "unknown",
    liquidityRole: "unknown",
  };
}

export async function getTradesPage(
  conditionId: string,
  opts: { limit?: number; cursor?: string; signal?: AbortSignal } = {}
): Promise<TradesPage> {
  const params = new URLSearchParams({
    condition: conditionId,
    limit: String(opts.limit ?? TRADE_PAGE_LIMIT),
  });
  if (opts.cursor) params.set("cursor", opts.cursor);
  const res = await fetch(`${DATA}/v2/trades?${params}`, {
    signal: opts.signal,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`data-api v2 trades ${res.status}`);
  const payload = (await res.json()) as {
    data?: RawTradeV2[];
    pagination?: { has_more?: boolean; next_cursor?: string; limit?: number; offset?: number };
  };
  assertDataTradesV2Shape(payload);
  const rows = Array.isArray(payload.data) ? payload.data : [];
  const trades = rows.map(mapTrade).filter((t): t is TradePoint => t != null);
  const hasMore = Boolean(payload.pagination?.has_more);
  const nextCursor = payload.pagination?.next_cursor;
  return {
    trades,
    nextCursor,
    hasMore,
    provenance: {
      asOf: new Date().toISOString(),
      sources: ["data-api.polymarket.com/v2/trades"],
      completeness: hasMore ? "partial_page" : "full",
      warnings: [],
      adapterVersions: { dataTrades: version },
    },
  };
}

export async function getTradesUntilCap(
  conditionId: string,
  signal?: AbortSignal
): Promise<{ trades: TradePoint[]; provenance: Provenance }> {
  const all: TradePoint[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  let truncated = false;
  let pages = 0;
  const warnings: string[] = [];

  while (pages < TRADE_MAX_PAGES) {
    const page = await getTradesPage(conditionId, { cursor, signal });
    pages += 1;
    for (const t of page.trades) {
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      all.push(t);
    }
    if (!page.hasMore || !page.nextCursor) break;
    cursor = page.nextCursor;
    if (pages >= TRADE_MAX_PAGES) {
      truncated = true;
      break;
    }
  }
  if (truncated) {
    warnings.push(
      `Trade history truncated after ${TRADE_MAX_PAGES * TRADE_PAGE_LIMIT} rows — narrow the window or widen backfill.`
    );
  }
  all.sort((a, b) => a.ts.localeCompare(b.ts));
  return {
    trades: all,
    provenance: {
      asOf: new Date().toISOString(),
      sources: ["data-api.polymarket.com/v2/trades"],
      completeness: truncated ? "truncated" : "full",
      warnings,
      adapterVersions: { dataTrades: version },
    },
  };
}

export function assertDataTradesV2Shape(payload: unknown): void {
  if (!payload || typeof payload !== "object") throw new Error("dataTradesV2 drift: not object");
  const o = payload as Record<string, unknown>;
  if (!Array.isArray(o.data)) throw new Error("dataTradesV2 drift: data not array");
  if (o.data[0]) {
    const row = o.data[0] as Record<string, unknown>;
    for (const k of ["proxy_wallet", "side", "token_id", "price", "size", "timestamp"] as const) {
      if (row[k] == null) throw new Error(`dataTradesV2 drift: missing ${k}`);
    }
  }
}
