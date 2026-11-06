/**
 * Polymarket data-api v2 trades adapter.
 *
 * Documented ingestion (public API as of 2026-11-06):
 * - Endpoint: GET /v2/trades?condition=<id>&limit≤100&cursor=<opaque>
 * - Order: newest → oldest
 * - No reliable server-side time filter (start/after/since ignored); windowing is client-side
 *   by continuing cursor pages until a fill older than `windowStartMs` appears, or has_more=false.
 * - Soft safety ceiling TRADE_PAGE_SAFETY_CEILING pages — not a claim of complete on-chain history.
 * - For true archival completeness beyond this public feed, use a self-hosted indexer / subgraph
 *   (out of scope for this client; we never claim that path here).
 */
import {
  ADAPTER_VERSIONS,
  TRADE_PAGE_LIMIT,
  TRADE_PAGE_SAFETY_CEILING,
  TRADE_RETRY_BASE_MS,
  TRADE_RETRY_MAX,
} from "../config";
import { unixToIso } from "../format";
import type { Provenance, TradeFetchMeta, TradePoint } from "../types";
import type { ClobInterval } from "./clobPricesV1";

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

export function intervalWindowStartMs(
  interval: ClobInterval,
  nowMs: number = Date.now()
): number | null {
  const hour = 3_600_000;
  switch (interval) {
    case "1h":
      return nowMs - hour;
    case "6h":
      return nowMs - 6 * hour;
    case "1d":
      return nowMs - 24 * hour;
    case "1w":
      return nowMs - 7 * 24 * hour;
    case "1m":
      return nowMs - 30 * 24 * hour;
    case "max":
      return null; // no lower bound — paginate to API exhaustion or safety ceiling
    default:
      return nowMs - 7 * 24 * hour;
  }
}

export function tradeMs(t: TradePoint): number {
  return Date.parse(t.ts);
}

export function mapTrade(row: RawTradeV2): TradePoint | null {
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

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      },
      { once: true }
    );
  });
}

async function fetchWithRetry(
  url: string,
  signal?: AbortSignal
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= TRADE_RETRY_MAX; attempt++) {
    if (signal?.aborted) throw Object.assign(new Error("Aborted"), { name: "AbortError" });
    try {
      const res = await fetch(url, { signal, cache: "no-store" });
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`data-api v2 trades ${res.status}`);
        const backoff = TRADE_RETRY_BASE_MS * Math.pow(2, attempt);
        await sleep(backoff, signal);
        continue;
      }
      throw new Error(`data-api v2 trades ${res.status}`);
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      lastErr = e;
      if (attempt < TRADE_RETRY_MAX) {
        await sleep(TRADE_RETRY_BASE_MS * Math.pow(2, attempt), signal);
        continue;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
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
  const res = await fetchWithRetry(`${DATA}/v2/trades?${params}`, opts.signal);
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

export type TradesWindowProgress = {
  trades: TradePoint[];
  meta: TradeFetchMeta;
};

/**
 * Paginate newest→oldest until window start, API exhaustion, abort, or safety ceiling.
 * Dedupes by stable TradePoint.id. Filters out fills older than windowStart (keeps in-window only).
 */
export async function getTradesForWindow(
  conditionId: string,
  opts: {
    windowStartMs: number | null;
    windowEndMs?: number | null;
    signal?: AbortSignal;
    safetyCeiling?: number;
    onProgress?: (p: TradesWindowProgress) => void;
  }
): Promise<{ trades: TradePoint[]; provenance: Provenance; meta: TradeFetchMeta }> {
  const windowStartMs = opts.windowStartMs;
  const windowEndMs = opts.windowEndMs ?? Date.now();
  const ceiling = opts.safetyCeiling ?? TRADE_PAGE_SAFETY_CEILING;
  const all: TradePoint[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  let pages = 0;
  let reachedWindowStart = false;
  let exhaustedApi = false;
  let hitSafetyCeiling = false;
  const warnings: string[] = [];

  const emit = (status: TradeFetchMeta["status"], note: string) => {
    const times = all.map(tradeMs).filter(Number.isFinite);
    const meta: TradeFetchMeta = {
      status,
      loadedCount: all.length,
      pagesFetched: pages,
      windowStartMs,
      windowEndMs,
      oldestLoadedMs: times.length ? Math.min(...times) : null,
      newestLoadedMs: times.length ? Math.max(...times) : null,
      reachedWindowStart,
      exhaustedApi,
      hitSafetyCeiling,
      note,
    };
    opts.onProgress?.({ trades: [...all], meta });
    return meta;
  };

  emit("loading", "Fetching fills (newest → oldest) for the selected interval…");

  while (true) {
    if (opts.signal?.aborted) {
      throw Object.assign(new Error("Aborted"), { name: "AbortError" });
    }
    if (pages >= ceiling) {
      hitSafetyCeiling = true;
      break;
    }

    const page = await getTradesPage(conditionId, { cursor, signal: opts.signal });
    pages += 1;

    for (const t of page.trades) {
      const ms = tradeMs(t);
      if (!Number.isFinite(ms)) continue;
      // API is newest-first: once we see older than window, stop ingesting further rows/pages.
      if (windowStartMs != null && ms < windowStartMs) {
        reachedWindowStart = true;
        continue;
      }
      if (ms > windowEndMs) continue; // rare clock skew / future
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      all.push(t);
    }

    emit(
      "loading",
      `Loaded ${all.length} fills in window (${pages} page${pages === 1 ? "" : "s"})…`
    );

    if (reachedWindowStart) break;
    if (!page.hasMore || !page.nextCursor) {
      exhaustedApi = true;
      break;
    }
    cursor = page.nextCursor;
  }

  all.sort((a, b) => a.ts.localeCompare(b.ts));

  let status: TradeFetchMeta["status"];
  let note: string;
  if (hitSafetyCeiling && !reachedWindowStart && !exhaustedApi) {
    status = "partial";
    note = `Stopped at safety ceiling (${ceiling} pages × ${TRADE_PAGE_LIMIT} max). Public data-api has no server time filter; older fills in this interval may still exist. Not a complete on-chain archive.`;
    warnings.push(note);
  } else if (reachedWindowStart || exhaustedApi) {
    status = "complete";
    note = exhaustedApi && (windowStartMs == null || reachedWindowStart)
      ? `Loaded ${all.length} fills covering the selected window via public data-api pagination (exhausted or reached interval start).`
      : reachedWindowStart
        ? `Loaded ${all.length} fills back to the interval start via public data-api pagination.`
        : `Loaded ${all.length} fills; public data-api reports no further pages for this condition.`;
  } else {
    status = "partial";
    note = `Loaded ${all.length} fills with incomplete coverage.`;
    warnings.push(note);
  }

  const meta = emit(status, note);
  const completeness: Provenance["completeness"] =
    status === "complete" ? "full" : status === "partial" ? "truncated" : "unknown";

  return {
    trades: all,
    provenance: {
      asOf: new Date().toISOString(),
      sources: ["data-api.polymarket.com/v2/trades"],
      completeness,
      warnings,
      adapterVersions: { dataTrades: version },
    },
    meta,
  };
}

/** @deprecated Prefer getTradesForWindow — kept for smoke callers. */
export async function getTradesUntilCap(
  conditionId: string,
  signal?: AbortSignal
): Promise<{ trades: TradePoint[]; provenance: Provenance; meta?: TradeFetchMeta }> {
  return getTradesForWindow(conditionId, {
    windowStartMs: null,
    signal,
    safetyCeiling: TRADE_PAGE_SAFETY_CEILING,
  });
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
