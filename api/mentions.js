// /api/mentions — earnings mention tracker
// GET  ?action=markets&ticker=AAPL
// POST {action:'transcripts', ticker, fmpKey, quarters}

const COMPANY_ALIASES = {
  AAPL: ['apple'], TSLA: ['tesla'], NVDA: ['nvidia'], MSFT: ['microsoft'],
  GOOGL: ['google', 'alphabet'], GOOG: ['google', 'alphabet'],
  META: ['meta', 'facebook'], AMZN: ['amazon'], NFLX: ['netflix'],
  AMD: ['amd advanced micro'], INTC: ['intel'], BABA: ['alibaba'],
  UBER: ['uber'], COIN: ['coinbase'], PLTR: ['palantir'],
  GME: ['gamestop'], HOOD: ['robinhood'], SOFI: ['sofi'],
  ORCL: ['oracle'], CRM: ['salesforce'], SNAP: ['snap snapchat'],
  SPOT: ['spotify'], ABNB: ['airbnb'], LYFT: ['lyft'],
};

const EARNINGS_KW = ['earnings', 'mention', 'beat', 'miss', 'guidance', 'revenue',
  'eps', 'call', 'quarterly', 'q1', 'q2', 'q3', 'q4', 'forecast', 'outlook'];

function safeJson(str, fb) { try { return JSON.parse(str); } catch { return fb; } }

function gFetch(url) {
  return fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
}

async function fetchMarkets(ticker) {
  const aliases = [ticker.toLowerCase(), ...(COMPANY_ALIASES[ticker.toUpperCase()] ?? [])];
  const seen = new Set();
  const raw = [];

  // Text searches per alias + earnings tag sweep
  const fetches = [
    ...aliases.flatMap(kw => [
      gFetch(`https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100&q=${encodeURIComponent(kw + ' earnings')}&order=volume&ascending=false`),
      gFetch(`https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100&q=${encodeURIComponent(kw)}&order=volume&ascending=false`),
    ]),
    // Tag-based sweep catches events regardless of title wording
    gFetch(`https://gamma-api.polymarket.com/events?active=true&closed=false&tag_slug=earnings&limit=200&order=volume&ascending=false`),
  ];

  await Promise.all(fetches.map(async p => {
    try {
      const r = await p;
      if (!r.ok) return;
      const d = await r.json();
      if (Array.isArray(d)) raw.push(...d);
    } catch {}
  }));

  return raw.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    const title = (e.title || '').toLowerCase();
    const hasCompany = aliases.some(a => title.includes(a.split(' ')[0]));
    const hasEarnings = EARNINGS_KW.some(k => title.includes(k));
    return hasCompany && hasEarnings;
  }).slice(0, 25).map(event => {
    const mkts = event.markets ?? [];
    return {
      id: event.id,
      title: event.title ?? '',
      slug: event.slug ?? '',
      volume: parseFloat(event.volume ?? 0),
      markets: mkts.map(m => ({
        id: m.id,
        question: m.question ?? event.title ?? '',
        outcomes: safeJson(m.outcomes, ['Yes', 'No']),
        prices:   safeJson(m.outcomePrices, ['0.5', '0.5']),
        volume:   parseFloat(m.volume ?? 0),
      })),
    };
  });
}

async function fetchTranscripts(ticker, fmpKey, quarters) {
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;
  const candidates = [];
  for (let y = curYear; y >= curYear - 2; y--) {
    for (let q = 4; q >= 1; q--) {
      if (y === curYear && q * 3 > curMonth + 1) continue;
      candidates.push({ year: y, quarter: q });
    }
  }
  const results = [];
  let lastError = null;
  for (const { year, quarter } of candidates) {
    if (results.length >= quarters) break;
    try {
      // FMP v3 endpoint — symbol in path
      const url = `https://financialmodelingprep.com/api/v3/earning_call_transcript/${ticker}?year=${year}&quarter=${quarter}&apikey=${fmpKey}`;
      const r = await fetch(url);
      const d = await r.json();
      if (!r.ok) { lastError = d?.['Error Message'] ?? `HTTP ${r.status}`; continue; }
      if (Array.isArray(d) && d.length > 0 && d[0].content?.length > 100) {
        results.push({ label: `Q${quarter} ${year}`, date: d[0].date ?? '', content: d[0].content });
      }
    } catch (e) { lastError = e.message; }
  }
  if (results.length === 0 && lastError) throw new Error(`FMP: ${lastError}`);
  return results;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = req.method === 'GET' ? req.query.action : req.body?.action;

  if (action === 'markets') {
    const ticker = (req.query.ticker || '').toUpperCase();
    if (!ticker) return res.status(400).json({ error: 'Missing ticker' });
    try {
      return res.status(200).json(await fetchMarkets(ticker));
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (action === 'transcripts') {
    const { ticker, quarters = 4 } = req.body ?? {};
    const fmpKey = process.env.FMP_KEY;
    if (!ticker) return res.status(400).json({ error: 'Missing ticker' });
    if (!fmpKey) return res.status(500).json({ error: 'FMP_KEY not configured' });
    try {
      return res.status(200).json(await fetchTranscripts(ticker.toUpperCase(), fmpKey, parseInt(quarters)));
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action. Use ?action=markets or {action:"transcripts"}' });
}
