// Discover top wallets in a specific Polymarket event/market
// GET /api/polylake/discover?url=https://polymarket.com/event/slug

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  // ── Extract slug from URL ──────────────────────────────────────────────────
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

    // ── Fetch top positions per market ────────────────────────────────────
    const allPositions = [];

    for (const market of markets) {
      const conditionId = market.conditionId;
      if (!conditionId) continue;

      try {
        const posRes = await fetch(
          `https://data-api.polymarket.com/positions?conditionId=${conditionId}&limit=100&offset=0&sizeThreshold=1`,
          { headers: { Accept: 'application/json' } }
        );
        if (!posRes.ok) continue;
        const positions = await posRes.json();
        if (!Array.isArray(positions)) continue;

        positions.forEach(p => {
          allPositions.push({
            user: p.user ?? p.proxyWallet ?? p.address,
            conditionId,
            marketQuestion: market.question ?? market.title ?? event.title,
            outcome: p.outcome,
            size: Number(p.size ?? 0),
            avgPrice: Number(p.avgPrice ?? 0),
            initialValue: Number(p.initialValue ?? 0),
            currentValue: Number(p.currentValue ?? 0),
            cashPnl: Number(p.cashPnl ?? 0),
            percentPnl: Number(p.percentPnl ?? 0),
          });
        });
      } catch {}
    }

    if (allPositions.length === 0) {
      return res.status(200).json({ event: { title: event.title, slug }, wallets: [] });
    }

    // ── Aggregate by wallet ───────────────────────────────────────────────
    const byWallet = {};
    for (const p of allPositions) {
      if (!p.user) continue;
      if (!byWallet[p.user]) {
        byWallet[p.user] = { user: p.user, positions: [], totalSize: 0, totalPnl: 0, totalValue: 0 };
      }
      byWallet[p.user].positions.push(p);
      byWallet[p.user].totalSize  += p.size;
      byWallet[p.user].totalPnl   += p.cashPnl;
      byWallet[p.user].totalValue += p.currentValue;
    }

    // ── Fetch display names for top wallets ───────────────────────────────
    const ranked = Object.values(byWallet)
      .sort((a, b) => b.totalSize - a.totalSize)
      .slice(0, 30);

    // Batch fetch profiles (up to 10 in parallel)
    await Promise.all(
      ranked.slice(0, 10).map(async w => {
        try {
          const r = await fetch(
            `https://data-api.polymarket.com/profiles?address=${w.user}`,
            { headers: { Accept: 'application/json' } }
          );
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

    return res.status(200).json({
      event: {
        title: event.title,
        slug,
        markets: markets.length,
      },
      wallets: ranked,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
