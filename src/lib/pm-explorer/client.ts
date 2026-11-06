import { ADAPTER_VERSIONS, getWatchList, type ExplorerPreset } from "./config";
import * as gamma from "./adapters/gammaEventsV1";
import * as clobPrices from "./adapters/clobPricesV1";
import * as clobBook from "./adapters/clobBookV1";
import * as dataTrades from "./adapters/dataTradesV2";
import type {
  ChildMarket,
  MarketGraphPayload,
  OrderBookSnapshot,
  Provenance,
  ResolveRequest,
  SearchHit,
  TradeFetchMeta,
  WatchWallet,
} from "./types";
import type { ClobInterval } from "./adapters/clobPricesV1";

export { classifyInput, parseExplorerInput, isBlockedHostname } from "./urlParse";
export { EXPLORER_PRESETS, WATCH_PRESETS, ADAPTER_VERSIONS, DISPLAY_TZ_LABEL } from "./config";
export type { ExplorerPreset };
export { intervalWindowStartMs } from "./adapters/dataTradesV2";

function mergeProvenance(parts: Provenance[]): Provenance {
  const warnings = parts.flatMap((p) => p.warnings);
  const sources = [...new Set(parts.flatMap((p) => p.sources))];
  const adapterVersions: Record<string, string> = {};
  for (const p of parts) Object.assign(adapterVersions, p.adapterVersions);
  const ranks = { full: 0, partial_page: 1, truncated: 2, unknown: 3 } as const;
  let completeness: Provenance["completeness"] = "full";
  for (const p of parts) {
    if (ranks[p.completeness] > ranks[completeness]) completeness = p.completeness;
  }
  return {
    asOf: new Date().toISOString(),
    sources,
    completeness,
    warnings,
    adapterVersions,
  };
}

export async function searchMarkets(
  q: string,
  signal?: AbortSignal
): Promise<{ hits: SearchHit[]; provenance: Provenance }> {
  return gamma.searchEvents(q, signal);
}

export async function resolveMarketInput(
  input: ResolveRequest,
  signal?: AbortSignal
) {
  return gamma.resolveInput(input, signal);
}

export async function loadMarketSeries(opts: {
  market: ChildMarket;
  event: MarketGraphPayload["event"];
  resolvedFrom: ResolveRequest;
  interval?: ClobInterval;
  watch?: WatchWallet[];
  signal?: AbortSignal;
  /** Progressive trade pages (newest→oldest within interval window). */
  onTradesProgress?: ( partial: {
    trades: MarketGraphPayload["trades"];
    tradeFetch: TradeFetchMeta;
    provenanceWarnings: string[];
  }) => void;
}): Promise<MarketGraphPayload> {
  const { market, event, resolvedFrom, interval = "1w", watch = [], signal, onTradesProgress } = opts;
  const tokens = market.outcomes.filter((o) => o.tokenId);

  const priceResults = await Promise.all(
    tokens.map(async (o) => {
      try {
        return await clobPrices.getPrices(o.tokenId, interval, 60, signal);
      } catch (e) {
        return {
          points: [],
          provenance: {
            asOf: new Date().toISOString(),
            sources: ["clob.polymarket.com/prices-history"],
            completeness: "unknown" as const,
            warnings: [`Price history failed for ${o.label}: ${(e as Error).message}`],
            adapterVersions: { clobPrices: ADAPTER_VERSIONS.clobPrices },
          },
        };
      }
    })
  );

  const windowStartMs = dataTrades.intervalWindowStartMs(interval);
  const windowEndMs = Date.now();

  const tradesPromise = dataTrades
    .getTradesForWindow(market.conditionId, {
      windowStartMs,
      windowEndMs,
      signal,
      onProgress: (p) => {
        onTradesProgress?.({
          trades: p.trades,
          tradeFetch: p.meta,
          provenanceWarnings: p.meta.status === "partial" ? [p.meta.note] : [],
        });
      },
    })
    .catch((e) => {
      if ((e as Error).name === "AbortError") throw e;
      const meta: TradeFetchMeta = {
        status: "error",
        loadedCount: 0,
        pagesFetched: 0,
        windowStartMs,
        windowEndMs,
        oldestLoadedMs: null,
        newestLoadedMs: null,
        reachedWindowStart: false,
        exhaustedApi: false,
        hitSafetyCeiling: false,
        note: `Trades unavailable: ${(e as Error).message}`,
      };
      onTradesProgress?.({ trades: [], tradeFetch: meta, provenanceWarnings: [meta.note] });
      return {
        trades: [] as Awaited<ReturnType<typeof dataTrades.getTradesForWindow>>["trades"],
        provenance: {
          asOf: new Date().toISOString(),
          sources: ["data-api.polymarket.com/v2/trades"],
          completeness: "unknown" as const,
          warnings: [meta.note],
          adapterVersions: { dataTrades: ADAPTER_VERSIONS.dataTrades },
        },
        meta,
      };
    });

  const bookPromises = tokens.slice(0, 4).map(async (o) => {
    const book = await clobBook.getBook(o.tokenId, signal);
    return { outcome: o, book };
  });

  const [tradesResult, bookRows] = await Promise.all([tradesPromise, Promise.all(bookPromises)]);

  const books: OrderBookSnapshot[] = [];
  const bookWarnings: string[] = [];
  for (const { outcome: o, book } of bookRows) {
    if ("unavailable" in book) {
      bookWarnings.push(`Order book unavailable for ${o.label}: ${book.reason}`);
    } else {
      books.push(book);
    }
  }

  const prices = priceResults.flatMap((r) => r.points);
  const provenance = mergeProvenance([
    ...priceResults.map((r) => r.provenance),
    tradesResult.provenance,
    {
      asOf: new Date().toISOString(),
      sources: books.length ? ["clob.polymarket.com/book"] : [],
      completeness: books.length ? "full" : "unknown",
      warnings: [
        ...bookWarnings,
        "Model fair unavailable — no point-in-time feed configured.",
      ],
      adapterVersions: {
        clobBook: ADAPTER_VERSIONS.clobBook,
        modelFair: ADAPTER_VERSIONS.modelFair,
      },
    },
  ]);

  // Dedupe trades by id (adapter already dedupes; belt-and-suspenders)
  const seen = new Set<string>();
  const trades = tradesResult.trades.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  return {
    event,
    market,
    outcomes: market.outcomes,
    prices,
    trades,
    modelFair: undefined,
    markers: [],
    book: books.length ? books : undefined,
    watch,
    provenance,
    mode: "live",
    resolvedFrom,
    tradeFetch: tradesResult.meta,
  };
}

export function pickPreferredMarket(
  markets: ChildMarket[],
  preferKinds?: string[],
  marketId?: string
): ChildMarket | null {
  if (!markets.length) return null;
  if (marketId) {
    const hit = markets.find((m) => m.marketId === marketId || m.slug === marketId);
    if (hit) return hit;
  }
  if (preferKinds?.length) {
    for (const k of preferKinds) {
      const hit = markets.find((m) => m.kind === k);
      if (hit) return hit;
    }
  }
  const money = markets.find((m) => m.kind === "series_match_winner" || m.kind === "binary");
  return money || markets[0];
}

export function applyPresetWatch(preset?: ExplorerPreset | null): WatchWallet[] {
  return getWatchList(preset?.watchPresetGroup);
}

export function healthSnapshot() {
  return {
    ok: true,
    adapterVersions: { ...ADAPTER_VERSIONS },
    asOf: new Date().toISOString(),
    notes: [
      "Client uses host proxies /api/polymarket, /api/clob, /api/poly-data",
      "data-api v1 is retired (410); trades adapter locks v2 snake_case",
      "Trades: cursor-paginate newest→oldest until interval start (no server time filter)",
    ],
  };
}
