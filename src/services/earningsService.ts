import { GoogleGenAI } from '@google/genai';

const FINNHUB_KEY     = process.env.FINNHUB_API_KEY     || '';
const COMMONSTACK_KEY = process.env.COMMONSTACK_API_KEY || '';
const COMMONSTACK_URL = 'https://api.commonstack.ai/v1/chat/completions';
const GEMINI_KEY      = process.env.GEMINI_API_KEY      || '';
const MASSIVE_KEY     = process.env.MASSIVE_API_KEY     || '';
const MASSIVE_BASE    = '/api/massive';

// --- Types ---

export interface UpcomingEarning {
  symbol: string;
  name: string;
  date: string;
  hour: 'bmo' | 'amc' | 'dmh' | '';
  epsEstimate: number | null;
  revenueEstimate: number | null;
  logo?: string;
  industry?: string;
  marketCap?: number;
}

export interface HistoricalQuarter {
  period: string;
  actual: number;
  estimate: number;
  surprise: number;
  surprisePct: number;
}

export interface PolymarketEarningsData {
  yesPct: number;
  volume: number;
  liquidity: number;
  slug: string;
  endDate: string;
}

export interface EarningsAnalysis {
  symbol: string;
  name: string;
  date: string;
  hour: string;
  epsEstimate: number | null;
  history: HistoricalQuarter[];
  beatCount: number;
  missCount: number;
  meetCount: number;
  beatRate: number;
  avgSurprisePct: number;
  prediction: 'BEAT' | 'MISS' | 'MEET' | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  reasoning: string;
  logo?: string;
  industry?: string;
  marketCap?: number;
  exchange?: string;
  polymarket?: PolymarketEarningsData;
}

// --- Rate limiting ---
// Finnhub free tier: 60 req/min. We pace to 55/min using a waiting queue
// so calls never silently fail — they wait for a slot instead.

const RATE_LIMIT = 55;
const callTimestamps: number[] = [];

async function acquireFinnhubToken(): Promise<void> {
  while (true) {
    const now = Date.now();
    // Expire timestamps older than 60 s
    while (callTimestamps.length > 0 && callTimestamps[0] < now - 60000) {
      callTimestamps.shift();
    }
    if (callTimestamps.length < RATE_LIMIT) {
      callTimestamps.push(now);
      return;
    }
    // Wait until the oldest token expires, then retry
    const waitMs = callTimestamps[0] + 60000 - now + 50;
    await new Promise(r => setTimeout(r, Math.min(waitMs, 500)));
  }
}

// Convenience: rate-limited fetch wrapper for all Finnhub URLs
async function finnhubFetch(url: string): Promise<Response> {
  await acquireFinnhubToken();
  return fetch(url);
}

// Legacy shim so existing non-Pro code paths still compile
function incrementUsage(): boolean {
  const now = Date.now();
  while (callTimestamps.length > 0 && callTimestamps[0] < now - 60000) {
    callTimestamps.shift();
  }
  if (callTimestamps.length >= RATE_LIMIT) return false;
  callTimestamps.push(now);
  return true;
}

// --- Caching ---

let calendarCache: { data: UpcomingEarning[]; ts: number } | null = null;
const profileCache = new Map<string, { name: string; logo?: string; industry?: string; marketCap?: number; exchange?: string }>();
const historyCache = new Map<string, HistoricalQuarter[]>();
const analysisCache: { data: EarningsAnalysis[]; ts: number } | null = null;
let fullAnalysisCache: { data: EarningsAnalysis[]; ts: number } | null = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// --- Finnhub API calls ---

export async function fetchUpcomingEarnings(): Promise<UpcomingEarning[]> {
  if (calendarCache && Date.now() - calendarCache.ts < CACHE_TTL) {
    return calendarCache.data;
  }

  if (!FINNHUB_KEY || !incrementUsage()) return [];

  try {
    const today = new Date();
    const from = today.toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10);

    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${FINNHUB_KEY}`
    );
    if (!res.ok) return [];

    const data = await res.json();
    const items = data.earningsCalendar || [];

    const earnings: UpcomingEarning[] = items
      .filter((e: any) => e.symbol && e.date)
      .map((e: any) => ({
        symbol: e.symbol,
        name: e.symbol, // will be enriched by profile
        date: e.date,
        hour: e.hour === 'bmo' ? 'bmo' : e.hour === 'amc' ? 'amc' : e.hour === 'dmh' ? 'dmh' : '',
        epsEstimate: e.epsEstimate ?? null,
        revenueEstimate: e.revenueEstimate ?? null,
      }));

    calendarCache = { data: earnings, ts: Date.now() };
    return earnings;
  } catch {
    return [];
  }
}

async function fetchEarningsHistoryMassive(symbol: string): Promise<HistoricalQuarter[]> {
  if (!MASSIVE_KEY) return [];
  try {
    const url = `${MASSIVE_BASE}/v2/reference/financials/${encodeURIComponent(symbol)}` +
      `?type=Q&limit=8&apiKey=${MASSIVE_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const results: any[] = data.results || [];
    return results
      .filter((q: any) => q.eps != null && q.epsEstimated != null)
      .map((q: any) => {
        const actual = q.eps;
        const estimate = q.epsEstimated;
        const surprise = actual - estimate;
        const surprisePct = estimate !== 0 ? (surprise / Math.abs(estimate)) * 100 : 0;
        return { period: q.reportPeriod || q.calendarDate || '', actual, estimate, surprise, surprisePct };
      });
  } catch {
    return [];
  }
}

export async function fetchEarningsHistory(symbol: string): Promise<HistoricalQuarter[]> {
  if (historyCache.has(symbol)) return historyCache.get(symbol)!;

  // Try Finnhub first
  let quarters: HistoricalQuarter[] = [];
  if (FINNHUB_KEY && incrementUsage()) {
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/stock/earnings?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          quarters = data
            .filter((q: any) => q.actual != null && q.estimate != null)
            .map((q: any) => {
              const actual = q.actual;
              const estimate = q.estimate;
              const surprise = actual - estimate;
              const surprisePct = estimate !== 0 ? (surprise / Math.abs(estimate)) * 100 : 0;
              return { period: q.period || '', actual, estimate, surprise, surprisePct };
            });
        }
      }
    } catch { /* fall through to Massive */ }
  }

  // Fall back to Massive (Polygon) if Finnhub returned nothing
  if (quarters.length === 0) {
    quarters = await fetchEarningsHistoryMassive(symbol);
  }

  historyCache.set(symbol, quarters);
  return quarters;
}

export async function fetchCompanyProfile(symbol: string): Promise<{ name: string; logo?: string; industry?: string; marketCap?: number; exchange?: string }> {
  if (profileCache.has(symbol)) return profileCache.get(symbol)!;
  if (!FINNHUB_KEY || !incrementUsage()) return { name: symbol };

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`
    );
    if (!res.ok) return { name: symbol };

    const data = await res.json();
    const profile = {
      name: data.name || symbol,
      logo: data.logo || undefined,
      industry: data.finnhubIndustry || undefined,
      marketCap: data.marketCapitalization || undefined,
      exchange: data.exchange || undefined,
    };

    profileCache.set(symbol, profile);
    return profile;
  } catch {
    return { name: symbol };
  }
}

// --- Polymarket earnings lookup ---

const POLYMARKET_API = '/api/polymarket';
const POLYMARKET_WEB = '/api/poly-web';

// Ticker -> slug map scraped from Polymarket earnings page
let earningsSlugMap: Map<string, string> | null = null;
let earningsSlugMapTs = 0;

// Extract ticker → slug from a single event slug string.
// Handles patterns like:
//   aapl-quarterly-earnings-q2-2026
//   aapl-q2-2026-earnings
//   aapl-2026-q2-earnings
//   aapl-earnings-q2-2026
function tickerFromSlug(slug: string): string | null {
  // Strip everything from "-earnings" or "-quarterly" onwards
  const cutPatterns = [
    /-quarterly-earnings/,
    /-earnings/,
    /-q[1-4]-/,
    /-\d{4}-/,
  ];
  let cut = slug;
  for (const p of cutPatterns) {
    const m = slug.search(p);
    if (m > 0) {
      cut = slug.slice(0, m);
      break;
    }
  }
  const ticker = cut.replace(/-/g, '').toUpperCase();
  // Sanity check: 1–6 uppercase letters
  return /^[A-Z]{1,6}$/.test(ticker) ? ticker : null;
}

async function getEarningsSlugMap(): Promise<Map<string, string>> {
  if (earningsSlugMap && Date.now() - earningsSlugMapTs < CACHE_TTL) {
    return earningsSlugMap;
  }

  const map = new Map<string, string>();

  // ── Approach 1: scrape Polymarket /predictions/earnings HTML ──────────────
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${POLYMARKET_WEB}/predictions/earnings`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const html = await res.text();
      // Match any /event/ slug that contains "earnings" anywhere in it
      const slugRegex = /\/event\/([a-z0-9-]*earnings[a-z0-9-]*)/g;
      let match;
      while ((match = slugRegex.exec(html)) !== null) {
        const slug = match[1];
        const ticker = tickerFromSlug(slug);
        if (ticker && !map.has(ticker)) map.set(ticker, slug);
      }
      console.log(`[PolyEarn] HTML scrape: ${map.size} earnings markets`);
    }
  } catch (err) {
    console.warn('[PolyEarn] HTML scrape failed:', err);
  }

  // ── Approach 2: Gamma API search (used if scrape returned nothing) ─────────
  if (map.size === 0) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(
        `${POLYMARKET_API}/events?search=quarterly+earnings&active=true&limit=500`,
        { signal: controller.signal },
      );
      clearTimeout(timeout);
      if (res.ok) {
        const events: any[] = await res.json();
        for (const event of events) {
          const slug: string = event.slug ?? '';
          if (!slug.toLowerCase().includes('earnings')) continue;
          const ticker = tickerFromSlug(slug);
          if (ticker && !map.has(ticker)) map.set(ticker, slug);
        }
        console.log(`[PolyEarn] Gamma API fallback: ${map.size} earnings markets`);
      }
    } catch (err) {
      console.warn('[PolyEarn] Gamma API fallback failed:', err);
    }
  }

  if (map.size > 0) {
    earningsSlugMap = map;
    earningsSlugMapTs = Date.now();
  }
  console.log(`[PolyEarn] Total earnings slug map size: ${map.size}`);
  return map.size > 0 ? map : (earningsSlugMap ?? new Map());
}

const polymarketCache = new Map<string, PolymarketEarningsData | null>();

async function fetchPolymarketEventBySlug(slug: string): Promise<PolymarketEarningsData | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${POLYMARKET_API}/events?slug=${slug}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const events = await res.json();
    if (!Array.isArray(events) || events.length === 0) return null;

    const event = events[0];
    const markets = event.markets || [];
    if (markets.length === 0) return null;

    const market = markets[0];
    const outcomePrices = typeof market.outcomePrices === 'string'
      ? JSON.parse(market.outcomePrices)
      : market.outcomePrices;

    const yesPct = parseFloat(outcomePrices?.[0] || '0') * 100;
    if (yesPct === 0) return null;

    return {
      yesPct,
      volume: parseFloat(market.volume || '0'),
      liquidity: parseFloat(market.liquidity || '0'),
      slug: event.slug,
      endDate: market.endDate || '',
    };
  } catch {
    return null;
  }
}

export async function fetchPolymarketEarnings(
  symbol: string,
): Promise<PolymarketEarningsData | null> {
  if (polymarketCache.has(symbol)) return polymarketCache.get(symbol) || null;

  const slugMap = await getEarningsSlugMap();
  const slug = slugMap.get(symbol);

  if (!slug) {
    polymarketCache.set(symbol, null);
    return null;
  }

  const data = await fetchPolymarketEventBySlug(slug);
  polymarketCache.set(symbol, data);
  return data;
}

// Get all available Polymarket earnings tickers
export async function getPolymarketEarningsTickers(): Promise<string[]> {
  const slugMap = await getEarningsSlugMap();
  return [...slugMap.keys()].sort();
}

// --- NYSE/NASDAQ filter ---

function isMajorExchange(exchange?: string): boolean {
  if (!exchange) return true; // include if unknown
  const upper = exchange.toUpperCase();
  return upper.includes('NYSE') || upper.includes('NASDAQ') || upper.includes('NEW YORK STOCK EXCHANGE');
}

// Pre-filter tickers that look like standard US exchange stocks
// Avoids wasting Finnhub API calls on OTC/foreign tickers
function looksLikeUSStock(symbol: string): boolean {
  // Standard US tickers: 1-5 uppercase letters, no dots/special chars
  // Exclude 5-letter tickers ending in F/Y (foreign ADRs on OTC)
  if (!/^[A-Z]{1,5}$/.test(symbol)) return false;
  if (symbol.length === 5 && /[FY]$/.test(symbol)) return false;
  return true;
}

// --- AI prediction ---

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  // Try Commonstack first
  if (COMMONSTACK_KEY) {
    try {
      const res = await fetch(COMMONSTACK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${COMMONSTACK_KEY}`,
        },
        body: JSON.stringify({
          model: 'commonstack-ai',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 2048,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim() || '';
        if (text) return text;
      }
    } catch (err) {
      console.warn('Commonstack earnings prediction failed, falling back to Gemini:', err);
    }
  }

  // Fallback to Gemini
  if (GEMINI_KEY) {
    const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `${systemPrompt}\n\n${userPrompt}`,
    });
    return response.text?.trim() || '';
  }

  return '';
}

function buildPredictionPrompt(companies: {
  symbol: string;
  name: string;
  industry?: string;
  epsEstimate: number | null;
  history: HistoricalQuarter[];
  beatRate: number;
  avgSurprisePct: number;
}[]): { system: string; user: string } {
  const system = `You are PolyEarn — an expert earnings analyst. For each company, predict whether they will BEAT, MISS, or MEET their upcoming EPS estimate based on their historical earnings track record and patterns. Return ONLY valid JSON (no markdown fences).`;

  const companiesBlock = companies.map(c => {
    const historyStr = c.history.slice(0, 20).map(q =>
      `  ${q.period}: actual=${q.actual.toFixed(2)} est=${q.estimate.toFixed(2)} surprise=${q.surprise >= 0 ? '+' : ''}${q.surprise.toFixed(2)} (${q.surprisePct >= 0 ? '+' : ''}${q.surprisePct.toFixed(1)}%)`
    ).join('\n');

    return `${c.symbol} (${c.name})${c.industry ? ` — ${c.industry}` : ''}
EPS Estimate: ${c.epsEstimate != null ? `$${c.epsEstimate.toFixed(2)}` : 'N/A'}
Beat Rate: ${c.beatRate.toFixed(0)}% | Avg Surprise: ${c.avgSurprisePct >= 0 ? '+' : ''}${c.avgSurprisePct.toFixed(1)}%
Historical Earnings (most recent first):
${historyStr || '  No history available'}`;
  }).join('\n\n');

  const user = `Analyze these upcoming earnings and predict beat/miss:

${companiesBlock}

Return JSON:
{
  "predictions": [
    {
      "symbol": "AAPL",
      "prediction": "BEAT" or "MISS" or "MEET",
      "confidence": "HIGH" or "MEDIUM" or "LOW",
      "reasoning": "1-2 sentences citing historical patterns, beat rate, and any notable trends"
    }
  ]
}

Rules:
- HIGH confidence = very strong historical pattern (>80% beat rate or <30% beat rate with consistent trend)
- MEDIUM confidence = moderate pattern or mixed recent results
- LOW confidence = insufficient data or conflicting signals
- MEET = within 1% of estimate`;

  return { system, user };
}

export async function getEarningsPredictions(
  companies: {
    symbol: string;
    name: string;
    industry?: string;
    epsEstimate: number | null;
    history: HistoricalQuarter[];
    beatRate: number;
    avgSurprisePct: number;
  }[]
): Promise<Map<string, { prediction: 'BEAT' | 'MISS' | 'MEET'; confidence: 'HIGH' | 'MEDIUM' | 'LOW'; reasoning: string }>> {
  const results = new Map<string, { prediction: 'BEAT' | 'MISS' | 'MEET'; confidence: 'HIGH' | 'MEDIUM' | 'LOW'; reasoning: string }>();

  if (companies.length === 0) return results;

  // Batch in groups of 5
  for (let i = 0; i < companies.length; i += 5) {
    const batch = companies.slice(i, i + 5);
    const { system, user } = buildPredictionPrompt(batch);

    try {
      const text = await callAI(system, user);
      const jsonStr = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      const parsed = JSON.parse(jsonStr);

      for (const p of parsed.predictions || []) {
        if (p.symbol && p.prediction) {
          results.set(p.symbol, {
            prediction: ['BEAT', 'MISS', 'MEET'].includes(p.prediction) ? p.prediction : 'MEET',
            confidence: ['HIGH', 'MEDIUM', 'LOW'].includes(p.confidence) ? p.confidence : 'MEDIUM',
            reasoning: p.reasoning || '',
          });
        }
      }
    } catch (err) {
      console.error('AI earnings prediction failed for batch:', err);
    }
  }

  return results;
}

// --- Main analysis function ---

export async function analyzeUpcomingEarnings(forceRefresh = false): Promise<EarningsAnalysis[]> {
  if (!forceRefresh && fullAnalysisCache && Date.now() - fullAnalysisCache.ts < CACHE_TTL) {
    return fullAnalysisCache.data;
  }

  const upcoming = await fetchUpcomingEarnings();
  if (upcoming.length === 0) return [];

  // Pre-filter to likely NYSE/NASDAQ tickers (cheap heuristic, no API calls)
  // Then take top 30 to limit API usage
  const topCompanies = upcoming
    .filter(e => looksLikeUSStock(e.symbol))
    .slice(0, 30);

  // Fetch profiles, history, and Polymarket data in parallel batches (3 at a time)
  const enriched: EarningsAnalysis[] = [];

  for (let i = 0; i < topCompanies.length; i += 3) {
    const batch = topCompanies.slice(i, i + 3);
    const results = await Promise.all(
      batch.map(async (earning) => {
        const [profile, history, polymarket] = await Promise.all([
          fetchCompanyProfile(earning.symbol),
          fetchEarningsHistory(earning.symbol),
          fetchPolymarketEarnings(earning.symbol),
        ]);

        // Skip if profile reveals non-US exchange
        if (profile.exchange && !isMajorExchange(profile.exchange)) {
          return null;
        }

        const beatCount = history.filter(q => q.surprise > 0.005).length;
        const missCount = history.filter(q => q.surprise < -0.005).length;
        const meetCount = history.length - beatCount - missCount;
        const beatRate = history.length > 0 ? (beatCount / history.length) * 100 : 0;
        const avgSurprisePct = history.length > 0
          ? history.reduce((sum, q) => sum + q.surprisePct, 0) / history.length
          : 0;

        return {
          symbol: earning.symbol,
          name: profile.name,
          date: earning.date,
          hour: earning.hour,
          epsEstimate: earning.epsEstimate,
          history,
          beatCount,
          missCount,
          meetCount,
          beatRate,
          avgSurprisePct,
          prediction: null,
          confidence: null,
          reasoning: '',
          logo: profile.logo,
          industry: profile.industry,
          marketCap: profile.marketCap,
          exchange: profile.exchange,
          polymarket: polymarket || undefined,
        } as EarningsAnalysis;
      })
    );
    enriched.push(...results.filter((r): r is EarningsAnalysis => r !== null));
  }

  // Get AI predictions for companies with history
  const withHistory = enriched.filter(e => e.history.length > 0);
  if (withHistory.length > 0) {
    const predictions = await getEarningsPredictions(
      withHistory.map(e => ({
        symbol: e.symbol,
        name: e.name,
        industry: e.industry,
        epsEstimate: e.epsEstimate,
        history: e.history,
        beatRate: e.beatRate,
        avgSurprisePct: e.avgSurprisePct,
      }))
    );

    for (const e of enriched) {
      const pred = predictions.get(e.symbol);
      if (pred) {
        e.prediction = pred.prediction;
        e.confidence = pred.confidence;
        e.reasoning = pred.reasoning;
      }
    }
  }

  fullAnalysisCache = { data: enriched, ts: Date.now() };
  return enriched;
}

// --- Analyze specific tickers (manual input mode) ---

const customTickerCache = new Map<string, { data: EarningsAnalysis; ts: number }>();

export async function analyzeCustomTickers(symbols: string[]): Promise<EarningsAnalysis[]> {
  if (symbols.length === 0) return [];

  // Check which ones we already have cached
  const results: EarningsAnalysis[] = [];
  const toFetch: string[] = [];

  for (const sym of symbols) {
    const cached = customTickerCache.get(sym);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      results.push(cached.data);
    } else {
      toFetch.push(sym);
    }
  }

  if (toFetch.length === 0) return results;

  // Fetch the Finnhub calendar once to try to match dates/estimates
  const calendar = await fetchUpcomingEarnings();
  const calendarMap = new Map(calendar.map(e => [e.symbol, e]));

  // Fetch profile + history + polymarket for each ticker (3 at a time)
  const enriched: EarningsAnalysis[] = [];

  for (let i = 0; i < toFetch.length; i += 3) {
    if (i > 0) await new Promise(r => setTimeout(r, 500)); // pace API calls
    const batch = toFetch.slice(i, i + 3);
    const batchResults = await Promise.all(
      batch.map(async (symbol) => {
        const calEntry = calendarMap.get(symbol);
        const earningsDate = calEntry?.date || '';
        const epsEstimate = calEntry?.epsEstimate ?? null;
        const hour = calEntry?.hour || '';

        const [profile, history, polymarket] = await Promise.all([
          fetchCompanyProfile(symbol),
          fetchEarningsHistory(symbol),
          fetchPolymarketEarnings(symbol),
        ]);

        const beatCount = history.filter(q => q.surprise > 0.005).length;
        const missCount = history.filter(q => q.surprise < -0.005).length;
        const meetCount = history.length - beatCount - missCount;
        const beatRate = history.length > 0 ? (beatCount / history.length) * 100 : 0;
        const avgSurprisePct = history.length > 0
          ? history.reduce((sum, q) => sum + q.surprisePct, 0) / history.length
          : 0;

        return {
          symbol,
          name: profile.name,
          date: earningsDate,
          hour,
          epsEstimate,
          history,
          beatCount,
          missCount,
          meetCount,
          beatRate,
          avgSurprisePct,
          prediction: null,
          confidence: null,
          reasoning: '',
          logo: profile.logo,
          industry: profile.industry,
          marketCap: profile.marketCap,
          exchange: profile.exchange,
          polymarket: polymarket || undefined,
        } as EarningsAnalysis;
      })
    );
    enriched.push(...batchResults);
  }

  // Get AI predictions for companies with history
  const withHistory = enriched.filter(e => e.history.length > 0);
  if (withHistory.length > 0) {
    const predictions = await getEarningsPredictions(
      withHistory.map(e => ({
        symbol: e.symbol,
        name: e.name,
        industry: e.industry,
        epsEstimate: e.epsEstimate,
        history: e.history,
        beatRate: e.beatRate,
        avgSurprisePct: e.avgSurprisePct,
      }))
    );

    for (const e of enriched) {
      const pred = predictions.get(e.symbol);
      if (pred) {
        e.prediction = pred.prediction;
        e.confidence = pred.confidence;
        e.reasoning = pred.reasoning;
      }
    }
  }

  // Cache each result
  for (const e of enriched) {
    customTickerCache.set(e.symbol, { data: e, ts: Date.now() });
  }

  return [...results, ...enriched];
}

// ─── Options IV & Skew (Massive API) ──────────────────────────────────────

export interface OptionsIVData {
  atmIV: number | null;      // ATM implied volatility as % (e.g. 45.2)
  putSkew: number | null;    // OTM put IV − ATM call IV in % points (positive = fear)
  nearExpiry: string | null; // expiry date used
  callIV: number | null;
  putIV: number | null;
}

const ivCache = new Map<string, { data: OptionsIVData | null; ts: number }>();

export async function fetchOptionsIV(
  symbol: string,
  earningsDate: string,
  currentPrice: number,
): Promise<OptionsIVData | null> {
  const key = `${symbol}-${earningsDate}`;
  const cached = ivCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  if (!MASSIVE_KEY || !currentPrice || !earningsDate) return null;

  try {
    const earningsTs  = new Date(earningsDate + 'T12:00:00').getTime();
    const expiryFrom  = new Date(earningsTs - 4 * 86400000).toISOString().slice(0, 10);
    const expiryTo    = new Date(earningsTs + 14 * 86400000).toISOString().slice(0, 10);
    const strikeLow   = (currentPrice * 0.85).toFixed(2);
    const strikeHigh  = (currentPrice * 1.15).toFixed(2);

    const url = `${MASSIVE_BASE}/v3/snapshot/options/${encodeURIComponent(symbol)}` +
      `?expiration_date.gte=${expiryFrom}&expiration_date.lte=${expiryTo}` +
      `&strike_price.gte=${strikeLow}&strike_price.lte=${strikeHigh}` +
      `&limit=250&apiKey=${MASSIVE_KEY}`;

    const res = await fetch(url);
    if (!res.ok) { ivCache.set(key, { data: null, ts: Date.now() }); return null; }
    const data = await res.json();
    const results: any[] = data.results || [];
    if (results.length === 0) { ivCache.set(key, { data: null, ts: Date.now() }); return null; }

    // Pick the expiry closest to earnings date
    const expiries = [...new Set(
      results.map((r: any) => r.details?.expiration_date).filter(Boolean)
    )].sort();
    const nearExpiry = expiries.reduce((best, d) =>
      Math.abs(new Date(d + 'T12:00:00').getTime() - earningsTs) <
      Math.abs(new Date(best + 'T12:00:00').getTime() - earningsTs) ? d : best
    , expiries[0]);

    const chain = results.filter(r => r.details?.expiration_date === nearExpiry);

    // ATM strike = closest to current price
    const strikes = [...new Set(chain.map((r: any) => Number(r.details?.strike_price)).filter(Boolean))]
      .sort((a, b) => Math.abs(a - currentPrice) - Math.abs(b - currentPrice));
    const atmStrike = strikes[0];

    const atmCall = chain.find(r => r.details?.strike_price === atmStrike && r.details?.contract_type === 'call');
    const atmPut  = chain.find(r => r.details?.strike_price === atmStrike && r.details?.contract_type === 'put');

    // IV from Massive is a decimal (0.45 = 45%) — multiply by 100
    const rawCallIV = atmCall?.implied_volatility ?? null;
    const rawPutIV  = atmPut?.implied_volatility  ?? null;

    // Guard: if value looks already-percentage (>2.0), don't double-multiply
    const toPercent = (v: number | null) =>
      v == null ? null : v > 2 ? v : v * 100;

    const callIV = toPercent(rawCallIV);
    const putIV  = toPercent(rawPutIV);
    const atmIV  = callIV !== null && putIV !== null
      ? (callIV + putIV) / 2
      : callIV ?? putIV;

    // OTM put skew: find put ~5% OTM (strike ≈ 95% of price)
    const otmPutTarget = currentPrice * 0.95;
    const otmPutStrike = strikes
      .filter(s => s < currentPrice * 0.98)
      .sort((a, b) => Math.abs(a - otmPutTarget) - Math.abs(b - otmPutTarget))[0];

    const otmPutContract = otmPutStrike
      ? chain.find(r => r.details?.strike_price === otmPutStrike && r.details?.contract_type === 'put')
      : null;
    const otmPutIV = toPercent(otmPutContract?.implied_volatility ?? null);

    const putSkew = otmPutIV !== null && callIV !== null ? otmPutIV - callIV : null;

    const result: OptionsIVData = { atmIV, putSkew, nearExpiry, callIV, putIV };
    ivCache.set(key, { data: result, ts: Date.now() });
    return result;
  } catch {
    ivCache.set(key, { data: null, ts: Date.now() });
    return null;
  }
}

// ─── Pro Analysis ──────────────────────────────────────────────────────────

export interface SignalFactor {
  label: string;
  value: string;
  score: number;  // -2 to +2
  detail: string;
}

export interface ProAnalysis {
  symbol: string;
  name: string;
  date: string;
  hour: string;
  epsEstimate: number | null;
  logo?: string;
  industry?: string;
  marketCap?: number;
  polymarket?: PolymarketEarningsData;
  // Earnings history
  history: HistoricalQuarter[];
  beatCount: number;
  missCount: number;
  meetCount: number;
  beatRate: number;
  avgSurprisePct: number;
  recentTrend: ('beat' | 'miss' | 'meet')[];
  // Analyst consensus
  analystBuy: number;
  analystHold: number;
  analystSell: number;
  analystBuyPct: number | null;
  analystCount: number;
  // Price target
  priceCurrent: number | null;
  priceTargetMean: number | null;
  priceTargetUpside: number | null;
  // Estimate dispersion (analyst spread)
  epsEstimateAvg: number | null;
  epsEstimateHigh: number | null;
  epsEstimateLow: number | null;
  estimateDispersionPct: number | null;  // (high-low)/|avg| as %
  // Insider activity (last 90 days)
  insiderNetShares: number | null;       // + = net buying, - = net selling
  insiderNetValue: number | null;
  // Fundamentals
  revenueGrowthTTM: number | null;      // % YoY
  shortInterestPct: number | null;
  peRatio: number | null;
  // Options IV & Skew
  optionsIV: OptionsIVData | null;
  // Sector
  sectorEtf: string;
  sectorReturns: EtfReturns | null;
  // Signal
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  signalScore: number;
  signalFactors: SignalFactor[];
  // V2 framework — fair probability & market edge
  beatScore: number;                               // 0–10 normalised beat probability score
  fairProbability: number;                         // fair YES% derived from beatScore
  marketAction: 'BUY_YES' | 'MAYBE_BUY_YES' | 'MAYBE_BUY_NO' | 'BUY_NO';
  edge: number | null;                             // pts between fair prob and market price (positive = edge exists)
  sizing: 'HIGH' | 'MEDIUM' | 'LOW' | null;
}

const recCache      = new Map<string, { data: { buy: number; hold: number; sell: number } | null; ts: number }>();
const ptCache       = new Map<string, { data: { mean: number; current: number } | null; ts: number }>();
const epsEstCache   = new Map<string, { data: { avg: number; high: number; low: number; count: number } | null; ts: number }>();
const insiderCache  = new Map<string, { data: { netShares: number; netValue: number } | null; ts: number }>();
const basicsCache   = new Map<string, { data: { revenueGrowthTTM: number | null; shortInterestPct: number | null; peRatio: number | null } | null; ts: number }>();

async function fetchRecommendationTrend(symbol: string): Promise<{ buy: number; hold: number; sell: number } | null> {
  const cached = recCache.get(symbol);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  if (!FINNHUB_KEY) return null;
  try {
    const res = await finnhubFetch(`https://finnhub.io/api/v1/stock/recommendation?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) { recCache.set(symbol, { data: null, ts: Date.now() }); return null; }
    const latest = data[0];
    const result = {
      buy:  (latest.buy || 0) + (latest.strongBuy || 0),
      hold: latest.hold || 0,
      sell: (latest.sell || 0) + (latest.strongSell || 0),
    };
    recCache.set(symbol, { data: result, ts: Date.now() });
    return result;
  } catch { return null; }
}

async function fetchPriceTargetData(symbol: string): Promise<{ mean: number; current: number } | null> {
  const cached = ptCache.get(symbol);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  if (!FINNHUB_KEY) return null;
  try {
    // Quote is free; price-target requires paid plan — fetch independently
    const [ptRes, qRes] = await Promise.all([
      finnhubFetch(`https://finnhub.io/api/v1/stock/price-target?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`),
      finnhubFetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`),
    ]);
    const q = qRes.ok ? await qRes.json() : null;
    const pt = ptRes.ok ? await ptRes.json() : null;
    const current = q?.c || null;
    const mean = pt?.targetMean || null;
    if (!current) { ptCache.set(symbol, { data: null, ts: Date.now() }); return null; }
    const result = { mean: mean ?? current, current };
    ptCache.set(symbol, { data: result, ts: Date.now() });
    return result;
  } catch { return null; }
}

async function fetchEpsEstimateData(symbol: string): Promise<{ avg: number; high: number; low: number; count: number } | null> {
  const cached = epsEstCache.get(symbol);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  if (!FINNHUB_KEY) return null;
  try {
    const res = await finnhubFetch(`https://finnhub.io/api/v1/stock/eps-estimate?symbol=${encodeURIComponent(symbol)}&freq=quarterly&token=${FINNHUB_KEY}`);
    if (!res.ok) return null;
    const data = await res.json();
    const items: any[] = data.data || data || [];
    // Take the first future/current quarter estimate
    const item = items.find((e: any) => e.epsAvg != null);
    if (!item) { epsEstCache.set(symbol, { data: null, ts: Date.now() }); return null; }
    const result = { avg: item.epsAvg, high: item.epsHigh ?? item.epsAvg, low: item.epsLow ?? item.epsAvg, count: item.numberAnalysts ?? 0 };
    epsEstCache.set(symbol, { data: result, ts: Date.now() });
    return result;
  } catch { return null; }
}

async function fetchInsiderActivityData(symbol: string): Promise<{ netShares: number; netValue: number } | null> {
  const cached = insiderCache.get(symbol);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  if (!FINNHUB_KEY) return null;
  try {
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const res = await finnhubFetch(`https://finnhub.io/api/v1/stock/insider-transactions?symbol=${encodeURIComponent(symbol)}&from=${cutoff}&token=${FINNHUB_KEY}`);
    if (!res.ok) return null;
    const data = await res.json();
    const txns: any[] = data.data || [];
    // P = Purchase, S = Sale
    let netShares = 0, netValue = 0;
    for (const t of txns) {
      const shares = t.change ?? t.share ?? 0;
      const price  = t.transactionPrice ?? 0;
      if (t.transactionCode === 'P') { netShares += shares; netValue += shares * price; }
      else if (t.transactionCode === 'S') { netShares -= shares; netValue -= shares * price; }
    }
    const result = { netShares, netValue };
    insiderCache.set(symbol, { data: result, ts: Date.now() });
    return result;
  } catch { return null; }
}

const INDUSTRY_ETF: Record<string, string> = {
  // Technology
  'Technology':                'XLK',
  'Software':                  'XLK',
  'Semiconductors':            'SOXX',
  'Electronic Technology':     'XLK',
  'Hardware':                  'XLK',
  // Financials
  'Financial Services':        'XLF',
  'Finance':                   'XLF',
  'Banks':                     'KBE',
  'Banking':                   'KBE',
  'Insurance':                 'KIE',
  // Healthcare
  'Healthcare':                'XLV',
  'Health Technology':         'XLV',
  'Health Services':           'XLV',
  'Pharmaceuticals':           'XPH',
  'Biotechnology':             'XBI',
  // Consumer
  'Consumer Cyclical':         'XLY',
  'Retail Trade':              'XRT',
  'Consumer Defensive':        'XLP',
  'Food & Beverage':           'XLP',
  // Industrials
  'Industrials':               'XLI',
  'Producer Manufacturing':    'XLI',
  'Transportation':            'XTN',
  // Energy
  'Energy':                    'XLE',
  'Energy Minerals':           'XLE',
  // Materials
  'Materials':                 'XLB',
  'Non-Energy Minerals':       'XLB',
  // Real Estate
  'Real Estate':               'XLRE',
  // Utilities
  'Utilities':                 'XLU',
  // Communication / Media
  'Communication Services':    'XLC',
  'Media':                     'XLC',
  'Telecommunications':        'XLC',
};

function industryToEtf(industry?: string): string {
  if (!industry) return 'SPY';
  // Try exact match first, then partial
  if (INDUSTRY_ETF[industry]) return INDUSTRY_ETF[industry];
  const key = Object.keys(INDUSTRY_ETF).find(k => industry.toLowerCase().includes(k.toLowerCase()));
  return key ? INDUSTRY_ETF[key] : 'SPY';
}

export interface EtfReturns { d30: number; d60: number }
const sectorCache = new Map<string, { data: EtfReturns | null; ts: number }>();

async function fetchEtfReturns(etf: string): Promise<EtfReturns | null> {
  const cached = sectorCache.get(etf);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  if (!FINNHUB_KEY) return null;
  try {
    const to   = Math.floor(Date.now() / 1000);
    const from = to - 65 * 86400;
    const res  = await finnhubFetch(
      `https://finnhub.io/api/v1/stock/candle?symbol=${etf}&resolution=D&from=${from}&to=${to}&token=${FINNHUB_KEY}`
    );
    if (!res.ok) { sectorCache.set(etf, { data: null, ts: Date.now() }); return null; }
    const data = await res.json();
    if (data.s !== 'ok') { sectorCache.set(etf, { data: null, ts: Date.now() }); return null; }
    const closes: number[] = data.c || [];
    if (closes.length < 5) { sectorCache.set(etf, { data: null, ts: Date.now() }); return null; }

    const last = closes[closes.length - 1];
    // approximate index for 30 and 60 calendar days back (assuming ~21 and ~42 trading days)
    const idx30 = Math.max(0, closes.length - 22);
    const idx60 = Math.max(0, closes.length - 43);
    const result: EtfReturns = {
      d30: ((last - closes[idx30]) / closes[idx30]) * 100,
      d60: ((last - closes[idx60]) / closes[idx60]) * 100,
    };
    sectorCache.set(etf, { data: result, ts: Date.now() });
    return result;
  } catch { return null; }
}

async function fetchBasicFinancialsData(symbol: string): Promise<{ revenueGrowthTTM: number | null; shortInterestPct: number | null; peRatio: number | null } | null> {
  const cached = basicsCache.get(symbol);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  if (!FINNHUB_KEY) return null;
  try {
    const res = await finnhubFetch(`https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${FINNHUB_KEY}`);
    if (!res.ok) return null;
    const data = await res.json();
    const m = data.metric || {};
    const result = {
      revenueGrowthTTM:  m.revenueGrowthTTMYoy ?? null,
      shortInterestPct:  m.shortInterest != null && m.sharesOutstanding ? (m.shortInterest / m.sharesOutstanding) * 100 : null,
      peRatio:           m.peInclExtraTTM ?? m.peTTM ?? null,
    };
    basicsCache.set(symbol, { data: result, ts: Date.now() });
    return result;
  } catch { return null; }
}

function computeSignal(
  beatRate: number,
  historyLen: number,
  avgSurprisePct: number,
  analystBuyPct: number | null,
  insiderNetValue: number | null,
  revenueGrowthTTM: number | null,
  optionsIV: OptionsIVData | null,
): { signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; signalScore: number; signalFactors: SignalFactor[]; beatScore: number } {
  const factors: SignalFactor[] = [];

  // 1. Historical beat rate
  let beatRateScore = 0;
  if (historyLen >= 4) {
    if (beatRate >= 75) beatRateScore = 2;
    else if (beatRate >= 55) beatRateScore = 1;
    else if (beatRate >= 40) beatRateScore = 0;
    else if (beatRate >= 25) beatRateScore = -1;
    else beatRateScore = -2;
  }
  factors.push({ label: 'Beat Rate', value: historyLen > 0 ? `${beatRate.toFixed(0)}%` : 'N/A', score: beatRateScore, detail: `${historyLen} quarters of history` });

  // 2. Average EPS surprise
  let surpriseScore = 0;
  if (historyLen >= 2) {
    if (avgSurprisePct >= 5) surpriseScore = 2;
    else if (avgSurprisePct >= 2) surpriseScore = 1;
    else if (avgSurprisePct >= -2) surpriseScore = 0;
    else if (avgSurprisePct >= -5) surpriseScore = -1;
    else surpriseScore = -2;
  }
  factors.push({ label: 'Avg Surprise', value: historyLen > 0 ? `${avgSurprisePct >= 0 ? '+' : ''}${avgSurprisePct.toFixed(1)}%` : 'N/A', score: surpriseScore, detail: 'Avg EPS surprise vs estimate' });

  // 4. Analyst buy %
  let analystScore = 0;
  if (analystBuyPct !== null) {
    if (analystBuyPct >= 70) analystScore = 2;
    else if (analystBuyPct >= 55) analystScore = 1;
    else if (analystBuyPct >= 40) analystScore = 0;
    else analystScore = -1;
  }
  factors.push({ label: 'Analyst Buys', value: analystBuyPct !== null ? `${analystBuyPct.toFixed(0)}%` : 'N/A', score: analystScore, detail: 'Buy + Strong Buy %' });

  // 5. Insider activity — net $ bought/sold in last 90 days
  let insiderScore = 0;
  if (insiderNetValue !== null) {
    if (insiderNetValue >= 1_000_000) insiderScore = 2;
    else if (insiderNetValue >= 100_000) insiderScore = 1;
    else if (insiderNetValue >= -100_000) insiderScore = 0;
    else if (insiderNetValue >= -1_000_000) insiderScore = -1;
    else insiderScore = -2;
  }
  const insiderLabel = insiderNetValue == null ? 'N/A'
    : insiderNetValue >= 0 ? `+$${(insiderNetValue / 1000).toFixed(0)}K net buy`
    : `-$${(Math.abs(insiderNetValue) / 1000).toFixed(0)}K net sell`;
  factors.push({ label: 'Insider Activity', value: insiderLabel, score: insiderScore, detail: 'Insider net buy/sell (90 days)' });

  // 6. Revenue growth TTM YoY
  let revScore = 0;
  if (revenueGrowthTTM !== null) {
    if (revenueGrowthTTM >= 20) revScore = 2;
    else if (revenueGrowthTTM >= 8) revScore = 1;
    else if (revenueGrowthTTM >= 0) revScore = 0;
    else if (revenueGrowthTTM >= -5) revScore = -1;
    else revScore = -2;
  }
  factors.push({
    label: 'Revenue Growth',
    value: revenueGrowthTTM !== null ? `${revenueGrowthTTM >= 0 ? '+' : ''}${revenueGrowthTTM.toFixed(1)}%` : 'N/A',
    score: revScore,
    detail: 'TTM revenue growth YoY',
  });

  // 6. ATM Implied Volatility — low IV = less uncertainty = easier to beat
  let ivScore = 0;
  if (optionsIV?.atmIV != null) {
    if (optionsIV.atmIV < 30)       ivScore =  1;
    else if (optionsIV.atmIV < 50)  ivScore =  0;
    else if (optionsIV.atmIV < 70)  ivScore = -1;
    else                            ivScore = -2;
  }
  factors.push({
    label: 'Options IV',
    value: optionsIV?.atmIV != null ? `${optionsIV.atmIV.toFixed(1)}%` : 'N/A',
    score: ivScore,
    detail: 'ATM implied volatility pre-earnings',
  });

  // 7. Put skew — positive = market buying put protection = downside fear
  let skewScore = 0;
  if (optionsIV?.putSkew != null) {
    if (optionsIV.putSkew < -1)      skewScore =  1;  // calls > puts = bullish positioning
    else if (optionsIV.putSkew < 2)  skewScore =  0;
    else if (optionsIV.putSkew < 6)  skewScore = -1;
    else                             skewScore = -2;
  }
  factors.push({
    label: 'Put Skew',
    value: optionsIV?.putSkew != null
      ? `${optionsIV.putSkew >= 0 ? '+' : ''}${optionsIV.putSkew.toFixed(1)}%`
      : 'N/A',
    score: skewScore,
    detail: 'OTM put IV − ATM call IV (positive = downside fear)',
  });

  const signalScore = factors.reduce((s, f) => s + f.score, 0);
  // 7 factors × max ±2 = ±14 theoretical; practical range ≈ ±8
  // BULLISH threshold ±4 → beatScore ≥8 / ≤2 when using ±8 normalisation
  const signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    signalScore >= 4 ? 'BULLISH' : signalScore <= -4 ? 'BEARISH' : 'NEUTRAL';

  // Normalise (±8 practical range) → beatScore 0–10
  // signalScore +4 → beatScore 8 (BUY_YES eligible), -4 → beatScore 2 (BUY_NO eligible)
  const beatScore = Math.min(10, Math.max(0, Math.round(((signalScore + 8) / 16) * 10)));

  return { signal, signalScore, signalFactors: factors, beatScore };
}

// V2 framework helpers
const FAIR_PROB_TABLE = [15, 22, 29, 36, 43, 50, 57, 64, 71, 78, 85]; // index = beatScore 0–10

export function computeMarketEdge(
  beatScore: number,
  polyYesPct: number | null,
): { fairProbability: number; marketAction: 'BUY_YES' | 'MAYBE_BUY_YES' | 'MAYBE_BUY_NO' | 'BUY_NO'; edge: number | null; sizing: 'HIGH' | 'MEDIUM' | 'LOW' | null } {
  const fairProbability = FAIR_PROB_TABLE[beatScore] ?? 50;

  const diff = polyYesPct != null ? fairProbability - polyYesPct : null;
  const edge = diff != null ? Math.abs(diff) : null;

  const marketAction: 'BUY_YES' | 'MAYBE_BUY_YES' | 'MAYBE_BUY_NO' | 'BUY_NO' =
    beatScore >= 8 ? 'BUY_YES'
    : beatScore >= 5 ? 'MAYBE_BUY_YES'
    : beatScore >= 3 ? 'MAYBE_BUY_NO'
    : 'BUY_NO';

  const sizing: 'HIGH' | 'MEDIUM' | 'LOW' | null =
    edge == null ? null
    : edge >= 15 ? 'HIGH'
    : edge >= 10 ? 'MEDIUM'
    : edge >= 7  ? 'LOW'
    : null;

  return { fairProbability, marketAction, edge, sizing };
}

const proCache = new Map<string, { data: ProAnalysis; ts: number }>();

export async function fetchProAnalysisList(
  symbols: string[],
  calendarMap: Map<string, UpcomingEarning>,
  onProgress?: (partial: ProAnalysis[]) => void,
): Promise<ProAnalysis[]> {
  const results: ProAnalysis[] = [];

  // Pre-fetch all profiles in parallel to warm the cache and discover unique ETFs,
  // then fetch all unique ETFs in parallel — all with the waiting rate limiter.
  const profiles = await Promise.all(symbols.map(s => fetchCompanyProfile(s)));
  const etfSet   = new Set(profiles.map(p => industryToEtf(p.industry)));
  await Promise.all([...etfSet].map(etf => fetchEtfReturns(etf)));

  for (let i = 0; i < symbols.length; i += 3) {
    if (i > 0) await new Promise(r => setTimeout(r, 400));
    const batch = symbols.slice(i, i + 3);

    const batchResults = await Promise.all(batch.map(async symbol => {
      const cached = proCache.get(symbol);
      if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

      const cal = calendarMap.get(symbol);
      const [profile, history, polymarket, rec, pt, epsEst, insider, basics] = await Promise.all([
        fetchCompanyProfile(symbol),
        fetchEarningsHistory(symbol),
        fetchPolymarketEarnings(symbol),
        fetchRecommendationTrend(symbol),
        fetchPriceTargetData(symbol),
        fetchEpsEstimateData(symbol),
        fetchInsiderActivityData(symbol),
        fetchBasicFinancialsData(symbol),
      ]);

      const sectorEtf    = industryToEtf(profile.industry);
      const sectorReturns = await fetchEtfReturns(sectorEtf); // hits cache from pre-fetch

      // Options IV — needs current price, fetched independently (no Finnhub quota)
      const currentPrice = pt?.current ?? null;
      const optionsIV = (cal?.date && currentPrice)
        ? await fetchOptionsIV(symbol, cal.date, currentPrice)
        : null;

      const beatCount   = history.filter(q => q.surprise > 0.005).length;
      const missCount   = history.filter(q => q.surprise < -0.005).length;
      const meetCount   = history.length - beatCount - missCount;
      const beatRate    = history.length > 0 ? (beatCount / history.length) * 100 : 0;
      const avgSurprisePct = history.length > 0
        ? history.reduce((s, q) => s + q.surprisePct, 0) / history.length : 0;

      const recentTrend = history.slice(0, 4).map(q =>
        q.surprise > 0.005 ? 'beat' : q.surprise < -0.005 ? 'miss' : 'meet'
      ) as ('beat' | 'miss' | 'meet')[];

      const totalAnalysts = rec ? rec.buy + rec.hold + rec.sell : 0;
      const analystBuyPct = totalAnalysts > 0 ? (rec!.buy / totalAnalysts) * 100 : null;
      const priceTargetUpside = pt ? ((pt.mean - pt.current) / pt.current) * 100 : null;

      const estimateDispersionPct = epsEst && Math.abs(epsEst.avg) > 0.001
        ? ((epsEst.high - epsEst.low) / Math.abs(epsEst.avg)) * 100 : null;

      const { signal, signalScore, signalFactors, beatScore } = computeSignal(
        beatRate, history.length, avgSurprisePct,
        analystBuyPct,
        insider?.netValue ?? null,
        basics?.revenueGrowthTTM ?? null,
        optionsIV,
      );

      const analysis: ProAnalysis = {
        symbol,
        name: profile.name,
        date: cal?.date || '',
        hour: cal?.hour || '',
        epsEstimate: cal?.epsEstimate ?? null,
        logo: profile.logo,
        industry: profile.industry,
        marketCap: profile.marketCap,
        polymarket: polymarket || undefined,
        history,
        beatCount, missCount, meetCount, beatRate, avgSurprisePct, recentTrend,
        analystBuy: rec?.buy ?? 0,
        analystHold: rec?.hold ?? 0,
        analystSell: rec?.sell ?? 0,
        analystBuyPct,
        analystCount: totalAnalysts,
        priceCurrent: pt?.current ?? null,
        priceTargetMean: pt?.mean ?? null,
        priceTargetUpside,
        epsEstimateAvg: epsEst?.avg ?? null,
        epsEstimateHigh: epsEst?.high ?? null,
        epsEstimateLow: epsEst?.low ?? null,
        estimateDispersionPct,
        insiderNetShares: insider?.netShares ?? null,
        insiderNetValue: insider?.netValue ?? null,
        revenueGrowthTTM: basics?.revenueGrowthTTM ?? null,
        shortInterestPct: basics?.shortInterestPct ?? null,
        peRatio: basics?.peRatio ?? null,
        optionsIV,
        sectorEtf,
        sectorReturns,
        signal, signalScore, signalFactors,
        beatScore,
        ...computeMarketEdge(beatScore, polymarket?.yesPct ?? null),
      };

      proCache.set(symbol, { data: analysis, ts: Date.now() });
      return analysis;
    }));

    results.push(...batchResults);
    onProgress?.([...results]);
  }

  return results;
}
