// Aggregates ALL paginated Polymarket rewards markets server-side.
// Fetches pages in parallel batches, merges Gamma end dates, returns scored list.
// Vercel edge cache: 5 min (set via Cache-Control header).

const CLOB_BASE   = 'https://clob.polymarket.com';
const GAMMA_BASE  = 'https://gamma-api.polymarket.com';
const BATCH_SIZE  = 8;   // parallel page fetches per round
const MAX_PAGES   = 120; // safety cap (~12,000 markets)

async function fetchPage(cursor) {
  const url = cursor
    ? `${CLOB_BASE}/rewards/markets/multi?next_cursor=${encodeURIComponent(cursor)}`
    : `${CLOB_BASE}/rewards/markets/multi`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`CLOB ${res.status} for cursor ${cursor}`);
  return res.json();
}

// Decode base64 cursor → numeric offset so we can pre-generate all cursors in parallel
function decodeCursor(b64) {
  try { return parseInt(Buffer.from(b64, 'base64').toString('utf8'), 10); }
  catch { return null; }
}
function encodeCursor(offset) {
  return Buffer.from(String(offset)).toString('base64');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    // ── Phase 1: discover total by fetching page 1 and probing ahead ──────────
    const firstPage = await fetchPage('');
    const allMarkets = [...(firstPage.data ?? [])];
    let nextCursor = firstPage.next_cursor;

    if (!nextCursor) {
      // Only one page
      return sendResult(res, allMarkets);
    }

    // The cursor is base64(offset). Use this to pre-generate all cursor values
    // and fetch all pages in parallel batches.
    const firstOffset = decodeCursor(nextCursor); // e.g. 100

    if (!firstOffset || firstOffset <= 0) {
      // Fallback: sequential fetch
      while (nextCursor && allMarkets.length < MAX_PAGES * 100) {
        const page = await fetchPage(nextCursor);
        allMarkets.push(...(page.data ?? []));
        nextCursor = page.next_cursor;
      }
      return sendResult(res, allMarkets);
    }

    const pageSize = firstOffset; // typically 100

    // Fetch page 2 to find the rough total — we'll generate cursors up to MAX_PAGES
    // and skip any that return empty
    const maxOffset = pageSize * MAX_PAGES;
    const cursors = [];
    for (let offset = firstOffset; offset < maxOffset; offset += pageSize) {
      cursors.push(encodeCursor(offset));
    }

    // Fetch in parallel batches
    for (let i = 0; i < cursors.length; i += BATCH_SIZE) {
      const batch = cursors.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(c => fetchPage(c)));
      let anyData = false;
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const items = r.value.data ?? [];
          if (items.length > 0) { anyData = true; allMarkets.push(...items); }
          // If a page has no next_cursor AND no data, we've gone past the end
        }
      }
      // Stop early if an entire batch returned nothing
      if (!anyData) break;
    }

    return sendResult(res, allMarkets);
  } catch (err) {
    console.error('rewards-markets error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function sendResult(res, rawMarkets) {
  // De-duplicate by condition_id
  const seen = new Set();
  const markets = rawMarkets.filter(m => {
    if (!m.condition_id || seen.has(m.condition_id)) return false;
    seen.add(m.condition_id);
    return (m.rewards_config ?? []).length > 0;
  });

  // ── Enrich with Gamma end dates ──────────────────────────────────────────────
  let gammaMap = {};
  try {
    // Fetch a large batch from Gamma for correct end dates
    const gammaRes = await fetch(
      `${GAMMA_BASE}/markets?active=true&closed=false&limit=500&order=volume&ascending=false`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (gammaRes.ok) {
      const gammaData = await gammaRes.json();
      if (Array.isArray(gammaData)) {
        for (const m of gammaData) {
          if (m.slug && m.endDate) gammaMap[m.slug] = m.endDate;
        }
      }
    }
  } catch { /* Gamma is supplementary; proceed without it */ }

  const now = Date.now();
  const enriched = markets.map(m => {
    const endDate = gammaMap[m.market_slug] ?? m.end_date ?? '';
    let daysUntilResolution = 0;
    if (endDate) {
      const diff = (new Date(endDate).getTime() - now) / 86_400_000;
      daysUntilResolution = Math.max(0, diff);
    }
    return { ...m, resolved_end_date: endDate, daysUntilResolution };
  });

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({ data: enriched, total: enriched.length });
}
