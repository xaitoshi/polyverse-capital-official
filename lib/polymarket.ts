import { CityInfo, resolveCity } from "./cities";

const GAMMA = "https://gamma-api.polymarket.com";

export type RawMarket = {
  id: string;
  question: string;
  slug: string;
  outcomes: string;
  outcomePrices: string;
  groupItemTitle?: string;
  volumeNum?: number;
  liquidityNum?: number;
  active?: boolean;
  closed?: boolean;
  endDate?: string;
  resolutionSource?: string;
  clobTokenIds?: string;
};

export type RawEvent = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  resolutionSource?: string;
  endDate?: string;
  startDate?: string;
  active?: boolean;
  closed?: boolean;
  volume?: number;
  openInterest?: number;
  markets?: RawMarket[];
};

export type Outcome = {
  id: string;
  label: string;
  probability: number;
  // CLOB token for the YES side — used to fetch price history.
  yesTokenId?: string;
};

export type TempMarket = {
  eventId: string;
  slug: string;
  title: string;
  kind: "high" | "low";
  city: CityInfo;
  cityKey: string;
  date: string;
  station?: string;
  resolutionUrl?: string;
  volume: number;
  openInterest: number;
  outcomes: Outcome[];
  endDate?: string;
  active: boolean;
  closed: boolean;
};

const TITLE_RE = /(highest|lowest)\s+temperature\s+in\s+(.+?)\s+on\s+(.+?)(?:\?|$)/i;
const WUG_RE = /wunderground\.com\/history\/daily\/(?:[^/]+\/)+([A-Z]{4})/;

function parseDateFromTitle(raw: string, endDate?: string): string | undefined {
  if (endDate) return endDate.slice(0, 10);
  const m = raw.match(/(\w+)\s+(\d{1,2})/);
  if (!m) return undefined;
  const y = new Date().getUTCFullYear();
  const d = new Date(`${m[1]} ${m[2]} ${y}`);
  return isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

function parseOutcomes(markets: RawMarket[] = []): Outcome[] {
  return markets
    .map((m) => {
      let prices: number[] = [];
      let tokens: string[] = [];
      try {
        prices = JSON.parse(m.outcomePrices || "[]").map(Number);
      } catch {
        /* ignore */
      }
      try {
        tokens = JSON.parse(m.clobTokenIds || "[]");
      } catch {
        /* ignore */
      }
      const yesPrice = prices[0] ?? 0;
      return {
        id: m.id,
        label: m.groupItemTitle || m.question,
        probability: yesPrice,
        yesTokenId: tokens[0],
      };
    })
    .sort((a, b) => b.probability - a.probability);
}

export function parseTempEvent(ev: RawEvent): TempMarket | null {
  const match = ev.title.match(TITLE_RE);
  if (!match) return null;

  const kind = match[1].toLowerCase() === "lowest" ? "low" : "high";
  const cityName = match[2].trim();
  const city = resolveCity(cityName);
  if (!city) return null;

  const resolutionUrl =
    ev.resolutionSource || ev.markets?.[0]?.resolutionSource || "";
  const stationMatch = resolutionUrl.match(WUG_RE);
  const station = stationMatch?.[1] || city.station;

  const date = parseDateFromTitle(match[3], ev.endDate);
  if (!date) return null;

  return {
    eventId: ev.id,
    slug: ev.slug,
    title: ev.title,
    kind,
    city: { ...city, station },
    cityKey: cityName.toLowerCase(),
    date,
    station,
    resolutionUrl,
    volume: ev.volume ?? 0,
    openInterest: ev.openInterest ?? 0,
    outcomes: parseOutcomes(ev.markets),
    endDate: ev.endDate,
    active: Boolean(ev.active),
    closed: Boolean(ev.closed),
  };
}

// `public-search?q=temperature` returns an indexed (and heavily stale)
// snapshot. The live list of active temperature markets lives under the
// `weather` tag, so we page through that instead and filter client-side.
async function fetchWeatherTagPage(
  offset: number,
  active: boolean
): Promise<RawEvent[]> {
  const params = new URLSearchParams({
    tag_slug: "weather",
    active: String(active),
    closed: active ? "false" : "true",
    archived: "false",
    limit: "50",
    offset: String(offset),
    order: "endDate",
    ascending: String(active), // soonest-first for open, newest-first for closed
  });
  const res = await fetch(`${GAMMA}/events?${params}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`polymarket ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? (data as RawEvent[]) : [];
}

async function crawlWeatherTag(active: boolean, maxPages: number) {
  const all: RawEvent[] = [];
  for (let i = 0; i < maxPages; i++) {
    const page = await fetchWeatherTagPage(i * 50, active);
    all.push(...page);
    if (page.length < 50) break;
  }
  return all;
}

export async function fetchTempEvents(
  opts: { includeClosed?: boolean } = {}
): Promise<TempMarket[]> {
  const { includeClosed = true } = opts;
  // Always pull all open events first; their end dates tell us how far back
  // we need to walk into the closed archive (we want at least ~2 weeks of
  // recent resolutions so the history chart has context).
  const open = await crawlWeatherTag(true, 6);
  const recent = includeClosed ? await crawlWeatherTag(false, 2) : [];

  // Deduplicate by event id, prefer the open copy.
  const byId = new Map<string, RawEvent>();
  for (const e of [...open, ...recent]) {
    if (!byId.has(e.id)) byId.set(e.id, e);
  }

  const parsed = [...byId.values()]
    .map(parseTempEvent)
    .filter((m): m is TempMarket => m !== null);
  return includeClosed ? parsed : parsed.filter((m) => !m.closed);
}
