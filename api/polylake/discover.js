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

    // ── Collect conditionIds and marketIds ────────────────────────────────
    const conditionIds = markets.map(m => m.conditionId).filter(Boolean);
    const marketIds = markets.map(m => m.id).filter(Boolean);

    // ── Fetch activity (trades) for the event via activity endpoint ───────
    // Use slug to get all trades in the event — this returns actual traders
    const allTrades = [];

    // Try fetching by slug first (most reliable)
    for (const market of markets) {
      const mSlug = market.slug ?? slug;
      try {
        const actRes = await fetch(
          `https://data-api.polymarket.com/activity?slug=${mSlug}&limit=500`,
          { headers: { Accept: 'application/json' } }
        );
        if (actRes.ok) {
          const acts = await actRes.json();
          if (Array.isArray(acts) && acts.length > 0) {
            acts.forEach(t => {
              const user = t.user ?? t.maker ?? t.proxyWallet;
              if (user) allTrades.push({ user, slug: mSlug, ...t });
            });
          }
        }
      } catch {}
    }

    // ── Fallback: try positions endpoint with conditionId ─────────────────
    // Some markets expose positions directly
    const allPositions = [];
    for (const conditionId of conditionIds) {
      try {
        // Try with marketId-style endpoint
        const posRes = await fetch(
          `https://data-api.polymarket.com/positions?market=${conditionId}&limit=100`,
          { headers: { Accept: 'application/json' } }
        );
        if (posRes.ok) {
          const positions = await posRes.json();
          if (Array.isArray(positions) && positions.length > 0) {
            positions.forEach(p => {
              const user = p.user ?? p.proxyWallet ?? p.address;
              if (user) allPositions.push({ user, conditionId, ...p });
            });
          }
        }
      } catch {}
    }

    // ── Also try leaderboard-style endpoint ───────────────────────────────
    for (const market of markets) {
      const conditionId = market.conditionId;
      if (!conditionId) continue;
      try {
        const lbRes = await fetch(
          `https://data-api.polymarket.com/positions?conditionId=${conditionId}&limit=100&offset=0`,
          { headers: { Accept: 'application/json' } }
        );
        if (lbRes.ok) {
          const lbData = await lbRes.json();
          if (Array.isArray(lbData) && lbData.length > 0) {
            lbData.forEach(p => {
              const user = p.user ?? p.proxyWallet ?? p.address;
              if (user) allPositions.push({ user, conditionId, ...p });
            });
          }
        }
      } catch {}
    }

    // ── Aggregate wallets from trades ─────────────────────────────────────
    const byWallet = {};

    for (const t of allTrades) {
      if (!t.user) continue;
      if (!byWallet[t.user]) {
        byWallet[t.user] = { user: t.user, tradeCount: 0, totalVolume: 0, totalPnl: 0, totalValue: 0, positions: [] };
      }
      byWallet[t.user].tradeCount += 1;
      byWallet[t.user].totalVolume += Number(t.usdcSize ?? t.amount ?? t.size ?? 0);
    }

    for (const p of allPositions) {
      if (!p.user) continue;
      if (!byWallet[p.user]) {
        byWallet[p.user] = { user: p.user, tradeCount: 0, totalVolume: 0, totalPnl: 0, totalValue: 0, positions: [] };
      }
      byWallet[p.user].totalPnl   += Number(p.cashPnl ?? 0);
      byWallet[p.user].totalValue += Number(p.currentValue ?? 0);
      byWallet[p.user].totalVolume = Math.max(
        byWallet[p.user].totalVolume,
        Number(p.size ?? 0)
      );
      byWallet[p.user].positions.push({
        outcome: p.outcome,
        size: Number(p.size ?? 0),
        avgPrice: Number(p.avgPrice ?? 0),
        currentValue: Number(p.currentValue ?? 0),
        cashPnl: Number(p.cashPnl ?? 0),
      });
    }

    if (Object.keys(byWallet).length === 0) {
      return res.status(200).json({ event: { title: event.title, slug }, wallets: [], debug: { conditionIds, marketIds, tradesFound: allTrades.length, positionsFound: allPositions.length } });
    }

    // ── Rank by total volume / trade count ────────────────────────────────
    const ranked = Object.values(byWallet)
      .sort((a, b) => (b.totalVolume || b.tradeCount) - (a.totalVolume || a.tradeCount))
      .slice(0, 30);

    // ── Fetch display names for top wallets (up to 15 in parallel) ────────
    await Promise.all(
      ranked.slice(0, 15).map(async w => {
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
