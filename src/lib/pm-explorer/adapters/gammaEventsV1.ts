import { ADAPTER_VERSIONS } from "../config";
import { detectMarketKind } from "../kindDetect";
import type {
  ChildMarket,
  EventConfig,
  OutcomeRef,
  Provenance,
  ResolveRequest,
  SearchHit,
} from "../types";
import { classifyInput } from "../urlParse";
import { resolveOutcomeBookSide, resolveOutcomeLastPrice } from "../outcomePrices";

export const version = ADAPTER_VERSIONS.gammaEvents;
const GAMMA = "/api/polymarket";

function provenance(extra: Partial<Provenance> = {}): Provenance {
  return {
    asOf: new Date().toISOString(),
    sources: ["gamma-api.polymarket.com"],
    completeness: "unknown",
    warnings: [],
    adapterVersions: { gammaEvents: version },
    ...extra,
  };
}

function parseJsonArray(raw: unknown): string[] {
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

function parseNumArray(raw: unknown): number[] {
  return parseJsonArray(raw).map(Number).filter((n) => Number.isFinite(n));
}

function mapEvent(ev: Record<string, unknown>): EventConfig {
  const slug = String(ev.slug || "");
  return {
    eventId: String(ev.id || ""),
    slug,
    title: String(ev.title || slug),
    category: typeof ev.category === "string" ? ev.category : undefined,
    startsAtUtc: typeof ev.startDate === "string" ? ev.startDate : undefined,
    endsAtUtc: typeof ev.endDate === "string" ? ev.endDate : undefined,
    canonicalUrl: slug ? `https://polymarket.com/event/${slug}` : undefined,
  };
}

function mapMarket(m: Record<string, unknown>, eventId: string): ChildMarket | null {
  const marketId = String(m.id || "");
  const conditionId = String(m.conditionId || "");
  if (!marketId || !conditionId) return null;

  const labels = parseJsonArray(m.outcomes);
  const prices = parseNumArray(m.outcomePrices);
  const tokens = parseJsonArray(m.clobTokenIds);
  const question = String(m.question || "");
  const slug = String(m.slug || "");
  const kind = detectMarketKind({
    question,
    sportsMarketType: (m.sportsMarketType as string) || null,
    groupItemTitle: (m.groupItemTitle as string) || null,
    outcomes: labels,
  });

  const marketLast =
    typeof m.lastTradePrice === "number" ? m.lastTradePrice : undefined;
  const marketBid = typeof m.bestBid === "number" ? m.bestBid : undefined;
  const marketAsk = typeof m.bestAsk === "number" ? m.bestAsk : undefined;

  const outcomes: OutcomeRef[] = labels.map((label, i) => ({
    marketId,
    conditionId,
    tokenId: tokens[i] || "",
    label,
    kind,
    complementaryGroupId: conditionId,
    outcomeIndex: i,
    marketQuestion: question,
    marketSlug: slug,
    volumeNum: typeof m.volumeNum === "number" ? m.volumeNum : undefined,
    bestBid: resolveOutcomeBookSide(i, "bid", marketBid, marketAsk),
    bestAsk: resolveOutcomeBookSide(i, "ask", marketBid, marketAsk),
    lastTradePrice: resolveOutcomeLastPrice(i, prices, marketLast),
  }));

  return {
    marketId,
    conditionId,
    slug,
    question,
    kind,
    groupItemTitle: typeof m.groupItemTitle === "string" ? m.groupItemTitle : undefined,
    volumeNum: typeof m.volumeNum === "number" ? m.volumeNum : undefined,
    outcomes: outcomes.filter((o) => o.tokenId),
    sportsMarketType: (m.sportsMarketType as string) || null,
  };
}

function mapMarkets(ev: Record<string, unknown>): ChildMarket[] {
  const eventId = String(ev.id || "");
  const raw = Array.isArray(ev.markets) ? ev.markets : [];
  const out: ChildMarket[] = [];
  for (const m of raw) {
    const mapped = mapMarket(m as Record<string, unknown>, eventId);
    if (mapped && mapped.outcomes.length) out.push(mapped);
  }
  out.sort((a, b) => (b.volumeNum || 0) - (a.volumeNum || 0));
  return out;
}

export async function searchEvents(
  q: string,
  signal?: AbortSignal
): Promise<{ hits: SearchHit[]; provenance: Provenance }> {
  const params = new URLSearchParams({
    q,
    limit_per_type: "12",
  });
  const res = await fetch(`${GAMMA}/public-search?${params}`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`gamma search ${res.status}`);
  const data = (await res.json()) as { events?: Record<string, unknown>[] };
  const events = Array.isArray(data.events) ? data.events : [];
  const hits: SearchHit[] = events.map((ev) => ({
    event: mapEvent(ev),
    markets: mapMarkets(ev),
  }));
  return {
    hits,
    provenance: provenance({
      completeness: hits.length ? "partial_page" : "full",
      warnings: hits.length === 0 ? ["No markets matched"] : [],
    }),
  };
}

export async function resolveEventBySlug(
  eventSlug: string,
  signal?: AbortSignal
): Promise<{ event: EventConfig; markets: ChildMarket[]; provenance: Provenance }> {
  const params = new URLSearchParams({ slug: eventSlug });
  const res = await fetch(`${GAMMA}/events?${params}`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`gamma events ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : [];
  if (!list.length) throw new Error(`Event not found for slug: ${eventSlug}`);
  const ev = list[0] as Record<string, unknown>;
  const markets = mapMarkets(ev);
  return {
    event: mapEvent(ev),
    markets,
    provenance: provenance({
      completeness: markets.length ? "full" : "unknown",
      warnings: markets.length === 0 ? ["Event resolved but no markets returned"] : [],
    }),
  };
}

export async function resolveMarketBySlug(
  marketSlug: string,
  signal?: AbortSignal
): Promise<{ event: EventConfig; markets: ChildMarket[]; selectedMarketId?: string; provenance: Provenance }> {
  const params = new URLSearchParams({ slug: marketSlug });
  const res = await fetch(`${GAMMA}/markets?${params}`, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`gamma markets ${res.status}`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : data ? [data] : [];
  if (!list.length) throw new Error(`Market not found for slug: ${marketSlug}`);
  const m = list[0] as Record<string, unknown>;
  const events = Array.isArray(m.events) ? (m.events as Record<string, unknown>[]) : [];
  const parent = events[0];
  if (parent?.slug) {
    const full = await resolveEventBySlug(String(parent.slug), signal);
    const selected = full.markets.find((x) => x.slug === marketSlug || x.marketId === String(m.id));
    return {
      ...full,
      selectedMarketId: selected?.marketId,
      provenance: provenance({
        ...full.provenance,
        warnings: [
          ...full.provenance.warnings,
          selected ? `Auto-selected market ${marketSlug}` : `Market slug ${marketSlug} not in event children`,
        ],
      }),
    };
  }
  // Fallback: synthesize single-market event
  const mapped = mapMarket(m, String(m.id || ""));
  if (!mapped) throw new Error("Market missing condition/tokens");
  return {
    event: {
      eventId: String(m.id || ""),
      slug: String(m.slug || marketSlug),
      title: String(m.question || marketSlug),
      canonicalUrl: `https://polymarket.com/event/${m.slug || marketSlug}`,
    },
    markets: [mapped],
    selectedMarketId: mapped.marketId,
    provenance: provenance({ completeness: "full", warnings: ["Resolved via markets?slug without parent event"] }),
  };
}

export async function resolveInput(
  input: ResolveRequest,
  signal?: AbortSignal
): Promise<{
  event: EventConfig;
  markets: ChildMarket[];
  selectedMarketId?: string;
  provenance: Provenance;
  searchHits?: SearchHit[];
}> {
  const { raw, kind } = input;

  if (kind === "keyword") {
    const { hits, provenance: p } = await searchEvents(raw, signal);
    return {
      event: hits[0]?.event || { eventId: "", slug: "", title: "" },
      markets: hits[0]?.markets || [],
      provenance: p,
      searchHits: hits,
    };
  }

  if (kind === "preset" || kind === "slug") {
    return resolveEventBySlug(raw.trim(), signal);
  }

  // url
  const classified = classifyInput(raw);
  const parsed = classified.parse;
  if (parsed.ok === false) {
    throw Object.assign(new Error(parsed.reason), { code: parsed.code });
  }
  if (parsed.eventSlug) {
    const resolved = await resolveEventBySlug(parsed.eventSlug, signal);
    let selectedMarketId: string | undefined;
    if (parsed.marketSlug) {
      selectedMarketId = resolved.markets.find((m) => m.slug === parsed.marketSlug)?.marketId;
    }
    return { ...resolved, selectedMarketId };
  }
  if (parsed.marketSlug) {
    return resolveMarketBySlug(parsed.marketSlug, signal);
  }
  throw new Error("Could not resolve URL to an event or market slug");
}

/** Schema lock: required fields on a gamma public-search event hit. */
export function assertGammaSearchEventShape(ev: Record<string, unknown>): void {
  for (const k of ["id", "slug", "title"] as const) {
    if (ev[k] == null || ev[k] === "") throw new Error(`gammaEventsV1 drift: missing event.${k}`);
  }
}

export function assertGammaMarketShape(m: Record<string, unknown>): void {
  for (const k of ["id", "conditionId", "clobTokenIds", "outcomes"] as const) {
    if (m[k] == null || m[k] === "") throw new Error(`gammaEventsV1 drift: missing market.${k}`);
  }
}
