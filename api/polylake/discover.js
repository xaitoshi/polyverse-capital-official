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

    // ── Collect all CLOB token IDs from markets ───────────────────────────
    // gamma API returns clobTokenIds as a JSON-encoded array string e.g. '["12345","67890"]'
    const tokenIds = [];
    for (const market of markets) {
      try {
        const ids = typeof market.clobTokenIds === 'string'
          ? JSON.parse(market.clobTokenIds)
          : (market.clobTokenIds ?? []);
        ids.forEach(id => tokenIds.push(String(id)));
      } catch {}
    }

    if (tokenIds.length === 0) {
      return res.status(200).json({
        event: { title: event.title, slug },
        wallets: [],
        debug: { markets: markets.length, tokenIds: [] },
      });
    }

    // ── Fetch trades from CLOB API for each token ─────────────────────────
    // clob.polymarket.com/trades?market={tokenId}&limit=500
    const byWallet = {};

    await Promise.all(
      tokenIds.map(async tokenId => {
        try {
          const r = await fetch(
            `https://clob.polymarket.com/trades?market=${tokenId}&limit=500`,
            { headers: { Accept: 'application/json' } }
          );
          if (!r.ok) return;
          const data = await r.json();
          const trades = Array.isArray(data) ? data : (data.data ?? data.trades ?? []);

          for (const t of trades) {
            // CLOB trades have maker_address and taker_address (proxy wallets)
            const addresses = [t.maker_address, t.taker_address].filter(Boolean);
            for (const addr of addresses) {
              if (!byWallet[addr]) {
                byWallet[addr] = { user: addr, tradeCount: 0, totalVolume: 0, totalPnl: 0, totalValue: 0, positions: [] };
              }
              byWallet[addr].tradeCount += 1;
              // fee_rate_bps or size fields
              const size = Number(t.size ?? t.matched_amount ?? 0);
              const price = Number(t.price ?? 0);
              byWallet[addr].totalVolume += size * price; // USDC value
            }
          }
        } catch {}
      })
    );

    if (Object.keys(byWallet).length === 0) {
      return res.status(200).json({
        event: { title: event.title, slug },
        wallets: [],
        debug: { tokenIds, marketsChecked: markets.length },
      });
    }

    // ── Rank by total USDC volume ─────────────────────────────────────────
    const ranked = Object.values(byWallet)
      .filter(w => w.tradeCount > 0)
      .sort((a, b) => b.totalVolume - a.totalVolume)
      .slice(0, 30);

    // ── Fetch display names + profile data for top wallets ────────────────
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
