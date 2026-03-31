// Discover top wallets trading in a specific Polymarket event/market
// Strategy: fetch global leaderboard, check which top traders have positions in this market
// GET /api/polylake/discover?url=https://polymarket.com/event/slug

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  const slugMatch = url.match(/polymarket\.com\/event\/([^/?#]+)/i);
  if (!slugMatch) return res.status(400).json({ error: 'Could not parse event slug from URL' });
  const slug = slugMatch[1];

  try {
    // ── 1. Fetch event + conditionId ───────────────────────────────────────
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

    const conditionIds = markets.map(m => m.conditionId).filter(Boolean);

    // ── 2. Fetch global leaderboard (top Polymarket traders) ──────────────
    // data-api requires user= for positions, but leaderboard gives us known traders
    let leaderboardUsers = [];
    try {
      const lbRes = await fetch(
        `https://data-api.polymarket.com/leaderboard?interval=all&limit=100&offset=0`,
        { headers: { Accept: 'application/json' } }
      );
      if (lbRes.ok) {
        const lbData = await lbRes.json();
        const arr = Array.isArray(lbData) ? lbData : (lbData?.data ?? lbData?.accounts ?? []);
        leaderboardUsers = arr.map(u => u.proxyWallet ?? u.address ?? u.user ?? u.id).filter(Boolean);
      }
    } catch {}

    if (leaderboardUsers.length === 0) {
      return res.status(200).json({
        event: { title: event.title, slug },
        wallets: [],
        message: 'Polymarket leaderboard returned no data. Try adding wallets manually.',
      });
    }

    // ── 3. Check each leaderboard user for positions in this market ────────
    // Batch in groups of 10 to avoid rate limits
    const results = [];
    const batchSize = 10;

    for (let i = 0; i < Math.min(leaderboardUsers.length, 80); i += batchSize) {
      const batch = leaderboardUsers.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (userAddr) => {
          try {
            const r = await fetch(
              `https://data-api.polymarket.com/positions?user=${userAddr}&limit=500&sizeThreshold=0`,
              { headers: { Accept: 'application/json' } }
            );
            if (!r.ok) return null;
            const positions = await r.json();
            if (!Array.isArray(positions)) return null;

            // Filter to positions in this market
            const marketPositions = positions.filter(p =>
              conditionIds.includes(p.conditionId)
            );
            if (marketPositions.length === 0) return null;

            return {
              user: userAddr,
              positions: marketPositions.map(p => ({
                outcome: p.outcome,
                size: Number(p.size ?? 0),
                avgPrice: Number(p.avgPrice ?? 0),
                currentValue: Number(p.currentValue ?? 0),
                cashPnl: Number(p.cashPnl ?? 0),
              })),
              totalSize: marketPositions.reduce((s, p) => s + Number(p.size ?? 0), 0),
              totalPnl: marketPositions.reduce((s, p) => s + Number(p.cashPnl ?? 0), 0),
              totalValue: marketPositions.reduce((s, p) => s + Number(p.currentValue ?? 0), 0),
              tradeCount: 0,
              totalVolume: marketPositions.reduce((s, p) => s + Number(p.size ?? 0), 0),
            };
          } catch {
            return null;
          }
        })
      );
      results.push(...batchResults.filter(Boolean));
    }

    if (results.length === 0) {
      return res.status(200).json({
        event: { title: event.title, slug },
        wallets: [],
        message: `Checked ${Math.min(leaderboardUsers.length, 80)} top Polymarket traders — none have open positions in this market.`,
      });
    }

    // ── 4. Sort by position size ───────────────────────────────────────────
    const ranked = results.sort((a, b) => b.totalSize - a.totalSize).slice(0, 30);

    // ── 5. Fetch display names ─────────────────────────────────────────────
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
      event: { title: event.title, slug, markets: markets.length },
      wallets: ranked,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
