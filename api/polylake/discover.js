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

    // ── Attempt 1: data-api positions by tokenId (market param) ──────────
    for (const tokenId of tokenIds) {
      try {
        const r = await fetch(
          `https://data-api.polymarket.com/positions?market=${tokenId}&limit=100`,
          { headers: { Accept: 'application/json' } }
        );
        const text = await r.text();
        let data; try { data = JSON.parse(text); } catch { data = null; }
        debugInfo.apiAttempts.push({ endpoint: `data-api/positions?market=${tokenId.slice(0,8)}...`, status: r.status, count: Array.isArray(data) ? data.length : (data ? 'obj' : 'null') });
        if (r.ok && Array.isArray(data) && data.length > 0) {
          for (const p of data) {
            const user = p.user ?? p.proxyWallet ?? p.address;
            if (!user) continue;
            if (!byWallet[user]) byWallet[user] = { user, tradeCount: 0, totalVolume: 0, totalPnl: 0, totalValue: 0, positions: [] };
            byWallet[user].totalVolume += Number(p.size ?? 0);
            byWallet[user].totalPnl += Number(p.cashPnl ?? 0);
            byWallet[user].totalValue += Number(p.currentValue ?? 0);
            byWallet[user].positions.push({ outcome: p.outcome, size: Number(p.size ?? 0), avgPrice: Number(p.avgPrice ?? 0), currentValue: Number(p.currentValue ?? 0), cashPnl: Number(p.cashPnl ?? 0) });
          }
        }
      } catch (e) { debugInfo.apiAttempts.push({ endpoint: `data-api/positions?market=tokenId`, error: e.message }); }
    }

    // ── Attempt 2: CLOB API trades ─────────────────────────────────────
    for (const tokenId of tokenIds) {
      try {
        const r = await fetch(
          `https://clob.polymarket.com/trades?market=${tokenId}&limit=500`,
          { headers: { Accept: 'application/json' } }
        );
        const text = await r.text();
        let data; try { data = JSON.parse(text); } catch { data = null; }
        const trades = Array.isArray(data) ? data : (data?.data ?? data?.trades ?? []);
        debugInfo.apiAttempts.push({ endpoint: `clob/trades?market=${tokenId.slice(0,8)}...`, status: r.status, count: trades.length, sample: trades[0] ? Object.keys(trades[0]) : [] });
        for (const t of trades) {
          const addresses = [t.maker_address, t.taker_address, t.user, t.proxyWallet].filter(Boolean);
          for (const addr of addresses) {
            if (!byWallet[addr]) byWallet[addr] = { user: addr, tradeCount: 0, totalVolume: 0, totalPnl: 0, totalValue: 0, positions: [] };
            byWallet[addr].tradeCount += 1;
            byWallet[addr].totalVolume += Number(t.size ?? t.matched_amount ?? 0) * Number(t.price ?? 1);
          }
        }
      } catch (e) { debugInfo.apiAttempts.push({ endpoint: `clob/trades?market=tokenId`, error: e.message }); }
    }

    // ── Attempt 3: data-api positions by conditionId ──────────────────────
    for (const conditionId of conditionIds) {
      try {
        const r = await fetch(
          `https://data-api.polymarket.com/positions?conditionId=${conditionId}&limit=100`,
          { headers: { Accept: 'application/json' } }
        );
        const text = await r.text();
        let data; try { data = JSON.parse(text); } catch { data = null; }
        debugInfo.apiAttempts.push({ endpoint: `data-api/positions?conditionId=${conditionId.slice(0,8)}...`, status: r.status, count: Array.isArray(data) ? data.length : (data ? 'obj' : 'null'), sample: Array.isArray(data) && data[0] ? Object.keys(data[0]) : [] });
        if (r.ok && Array.isArray(data) && data.length > 0) {
          for (const p of data) {
            const user = p.user ?? p.proxyWallet ?? p.address;
            if (!user) continue;
            if (!byWallet[user]) byWallet[user] = { user, tradeCount: 0, totalVolume: 0, totalPnl: 0, totalValue: 0, positions: [] };
            byWallet[user].totalVolume += Number(p.size ?? 0);
            byWallet[user].totalPnl += Number(p.cashPnl ?? 0);
          }
        }
      } catch (e) { debugInfo.apiAttempts.push({ endpoint: `data-api/positions?conditionId`, error: e.message }); }
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
