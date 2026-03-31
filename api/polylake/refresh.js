// Fetches fresh trades + positions from Polymarket and upserts into Supabase

const SB_URL = () => process.env.SUPABASE_URL;
const SB_KEY = () => process.env.SUPABASE_SERVICE_KEY;

const sbHeaders = (extra = {}) => ({
  'apikey': SB_KEY(),
  'Authorization': `Bearer ${SB_KEY()}`,
  'Content-Type': 'application/json',
  ...extra,
});

async function sbUpsert(table, rows, onConflict) {
  if (!rows.length) return;
  const r = await fetch(
    `${SB_URL()}/rest/v1/${table}`,
    {
      method: 'POST',
      headers: sbHeaders({ 'Prefer': `resolution=merge-duplicates,return=minimal` }),
      body: JSON.stringify(rows),
    }
  );
  return r;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'address required' });

  try {
    // ── Fetch trades from Polymarket ──────────────────────────────────────────
    let trades = [];
    try {
      const r = await fetch(
        `https://data-api.polymarket.com/activity?user=${address}&limit=50`,
        { headers: { Accept: 'application/json' } }
      );
      if (r.ok) trades = await r.json();
    } catch {}

    // ── Fetch positions from Polymarket ───────────────────────────────────────
    let positions = [];
    try {
      const r = await fetch(
        `https://data-api.polymarket.com/positions?user=${address}&limit=500&offset=0&sizeThreshold=.001`,
        { headers: { Accept: 'application/json' } }
      );
      if (r.ok) positions = await r.json();
    } catch {}

    // ── Upsert trades ─────────────────────────────────────────────────────────
    if (trades.length > 0) {
      const tradeRows = trades.map(t => ({
        wallet_address: address,
        trade_id: t.id || t.transactionHash || `${address}-${t.timestamp}`,
        timestamp: t.timestamp ? new Date(t.timestamp * 1000).toISOString() : null,
        type: t.type,
        outcome: t.outcome,
        title: t.title,
        slug: t.slug,
        price: t.price,
        size: t.size,
        usdc_size: t.usdcSize,
        transaction_hash: t.transactionHash,
      }));
      await sbUpsert('wallet_trades', tradeRows);
    }

    // ── Upsert positions ──────────────────────────────────────────────────────
    if (positions.length > 0) {
      const posRows = positions.map(p => ({
        wallet_address: address,
        condition_id: p.conditionId,
        title: p.title,
        slug: p.slug,
        outcome: p.outcome,
        size: p.size,
        avg_price: p.avgPrice,
        initial_value: p.initialValue,
        current_value: p.currentValue,
        cash_pnl: p.cashPnl,
        percent_pnl: p.percentPnl,
        end_date: p.endDate,
        closed: p.closed ?? false,
        winning_outcome: p.winningOutcome ?? null,
        last_updated: new Date().toISOString(),
      }));
      await sbUpsert('wallet_positions', posRows);
    }

    // ── Compute summary stats ─────────────────────────────────────────────────
    const closed = positions.filter(p => p.closed);
    const wins = closed.filter(p =>
      p.winningOutcome && p.outcome &&
      p.winningOutcome.toLowerCase() === p.outcome.toLowerCase()
    );
    const win_rate = closed.length > 0 ? wins.length / closed.length : null;
    const openPositions = positions.filter(p => !p.closed);
    const total_pnl = openPositions.reduce((sum, p) => sum + (p.cashPnl || 0), 0);
    const open_positions = openPositions.length;

    // ── Update wallet row ─────────────────────────────────────────────────────
    await fetch(`${SB_URL()}/rest/v1/wallets?address=eq.${address}`, {
      method: 'PATCH',
      headers: sbHeaders({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify({
        win_rate,
        total_pnl,
        open_positions,
        last_refreshed_at: new Date().toISOString(),
      }),
    });

    return res.status(200).json({
      trades: trades.length,
      positions: positions.length,
      win_rate,
      total_pnl,
      open_positions,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
