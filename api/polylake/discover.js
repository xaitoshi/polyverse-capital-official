// Discover top wallets in a specific Polymarket event/market
// GET /api/polylake/discover?url=https://polymarket.com/event/slug

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  const slugMatch = url.match(/polymarket\.com\/event\/([^/?#]+)/i);
  if (!slugMatch) return res.status(400).json({ error: 'Could not parse event slug from URL' });
  const slug = slugMatch[1];

  try {
    // ── Fetch event from Gamma API ─────────────────────────────────────────
    const eventRes = await fetch(
      `https://gamma-api.polymarket.com/events?slug=${slug}&limit=1`,
      { headers: { Accept: 'application/json' } }
    );
    if (!eventRes.ok) return res.status(502).json({ error: `Gamma API error: ${eventRes.status}` });

    const events = await eventRes.json();
    const event = Array.isArray(events) ? events[0] : events;
    if (!event) return res.status(404).json({ error: `Event not found for slug: ${slug}` });

    const markets = event.markets ?? [];
    if (markets.length === 0) return res.status(404).json({ error: 'No markets found in event' });

    // ── Collect token IDs and condition IDs ───────────────────────────────
    const tokenIds = [];
    const conditionIds = [];
    for (const market of markets) {
      if (market.conditionId) conditionIds.push(market.conditionId);
      try {
        const ids = typeof market.clobTokenIds === 'string'
          ? JSON.parse(market.clobTokenIds)
          : (market.clobTokenIds ?? []);
        ids.forEach(id => tokenIds.push(String(id)));
      } catch {}
    }

    const debugInfo = { tokenIds, conditionIds, markets: markets.length, apiAttempts: [] };

    const byWallet = {};

    // Helper to ingest positions array into byWallet
    const ingestPositions = (data) => {
      if (!Array.isArray(data)) return 0;
      let count = 0;
      for (const p of data) {
        const user = p.user ?? p.proxyWallet ?? p.address ?? p.walletAddress;
        if (!user) continue;
        if (!byWallet[user]) byWallet[user] = { user, tradeCount: 0, totalVolume: 0, totalPnl: 0, totalValue: 0, positions: [] };
        byWallet[user].totalVolume += Number(p.size ?? 0);
        byWallet[user].totalPnl += Number(p.cashPnl ?? 0);
        byWallet[user].totalValue += Number(p.currentValue ?? 0);
        byWallet[user].positions.push({ outcome: p.outcome, size: Number(p.size ?? 0), avgPrice: Number(p.avgPrice ?? 0), currentValue: Number(p.currentValue ?? 0), cashPnl: Number(p.cashPnl ?? 0) });
        count++;
      }
      return count;
    };

    const tryFetch = async (label, url) => {
      try {
        const r = await fetch(url, { headers: { Accept: 'application/json' } });
        const text = await r.text();
        let data; try { data = JSON.parse(text); } catch { data = null; }
        const arr = Array.isArray(data) ? data : (data?.data ?? data?.positions ?? data?.results ?? []);
        const count = ingestPositions(arr);
        const info = { endpoint: label, status: r.status, rows: arr.length, ingested: count };
        if (!r.ok) info.errorBody = text.slice(0, 200);
        else if (arr[0]) info.keys = Object.keys(arr[0]);
        debugInfo.apiAttempts.push(info);
      } catch (e) {
        debugInfo.apiAttempts.push({ endpoint: label, error: e.message });
      }
    };

    // ── Attempt 1: conditionId + sizeThreshold (original approach) ────────
    for (const conditionId of conditionIds) {
      await tryFetch(`data-api/positions?conditionId+sizeThreshold=0`,
        `https://data-api.polymarket.com/positions?conditionId=${conditionId}&limit=100&offset=0&sizeThreshold=0`);
      await tryFetch(`data-api/positions?conditionId+sizeThreshold=1`,
        `https://data-api.polymarket.com/positions?conditionId=${conditionId}&limit=100&offset=0&sizeThreshold=1`);
    }

    // ── Attempt 2: asset_id ────────────────────────────────────────────────
    for (const tokenId of tokenIds.slice(0, 1)) {
      await tryFetch(`data-api/positions?asset_id=${tokenId.slice(0,8)}...`,
        `https://data-api.polymarket.com/positions?asset_id=${tokenId}&limit=100`);
    }

    // ── Attempt 3: gamma market endpoint - fetch full market fields ────────
    for (const market of markets) {
      if (market.conditionId) {
        await tryFetch(`gamma-api/markets?conditionId=${market.conditionId.slice(0,8)}...`,
          `https://gamma-api.polymarket.com/markets?conditionId=${market.conditionId}`);
      }
    }

    // ── Attempt 4: Polymarket strapi (older public API) ───────────────────
    for (const conditionId of conditionIds) {
      await tryFetch(`strapi/positions?conditionId=${conditionId.slice(0,8)}...`,
        `https://strapi-matic.polymarket.com/positions?conditionId=${conditionId}&limit=100`);
    }

    if (Object.keys(byWallet).length === 0) {
      return res.status(200).json({ event: { title: event.title, slug }, wallets: [], debug: debugInfo });
    }

    const ranked = Object.values(byWallet)
      .sort((a, b) => (b.totalVolume || b.tradeCount) - (a.totalVolume || a.tradeCount))
      .slice(0, 30);

    await Promise.all(
      ranked.slice(0, 15).map(async w => {
        try {
          const r = await fetch(`https://data-api.polymarket.com/profiles?address=${w.user}`, { headers: { Accept: 'application/json' } });
          if (r.ok) {
            const profiles = await r.json();
            const p = Array.isArray(profiles) ? profiles[0] : profiles;
            w.displayName = p?.name || p?.displayName || null;
            w.pfpUrl      = p?.profileImage || p?.pfpUrl || null;
            w.username    = p?.username || null;
          }
        } catch {}
      })
    );

    return res.status(200).json({ event: { title: event.title, slug, markets: markets.length }, wallets: ranked });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
