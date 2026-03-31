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
    // ── Fetch trades from Polymarket (up to 500 for win rate accuracy) ─────────
    let trades = [];
    try {
      const r = await fetch(
        `https://data-api.polymarket.com/activity?user=${address}&limit=500`,
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

    // ── Upsert trades (store last 100 for display) ────────────────────────────
    const tradesToStore = trades.slice(0, 100);
    if (tradesToStore.length > 0) {
      const tradeRows = tradesToStore.map(t => ({
        wallet_address: address,
        trade_id: t.id || t.transactionHash || `${address}-${t.timestamp}`,
        timestamp: t.timestamp ? new Date(Number(t.timestamp) * 1000).toISOString() : null,
        type: t.side ?? t.type ?? 'TRADE',        // Polymarket uses 'side' not 'type'
        outcome: t.outcome ?? '',
        title: t.title ?? t.market ?? '',
        slug: t.slug ?? '',
        price: Number(t.price ?? 0),
        size: Number(t.size ?? 0),
        usdc_size: Number(t.usdcSize ?? t.amount ?? 0),
        transaction_hash: t.transactionHash ?? '',
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
    // Win rate from activity: REDEEM = won, unique BUY slugs = total entered
    // (Positions API filters out size=0 losses so can't be used for win rate)
    const buyMarkets  = new Set(trades.filter(t => (t.side ?? t.type) === 'BUY').map(t => t.slug || t.conditionId).filter(Boolean));
    const redeemMarkets = new Set(trades.filter(t => (t.side ?? t.type) === 'REDEEM').map(t => t.slug || t.conditionId).filter(Boolean));
    const win_rate = buyMarkets.size > 0 ? redeemMarkets.size / buyMarkets.size : null;

    const openPositions = positions.filter(p => !p.closed);
    const total_pnl = openPositions.reduce((sum, p) => sum + (p.cashPnl || 0), 0);
    const portfolio_value = openPositions.reduce((sum, p) => sum + (p.currentValue || 0), 0);
    const open_positions = openPositions.length;

    // ── Generate AI summary via Gemini ───────────────────────────────────────
    let ai_summary = null;
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && (trades.length > 0 || positions.length > 0)) {
      try {
        const openPos = positions.filter(p => !p.closed).slice(0, 10);
        const recentTrades = trades.slice(0, 15);
        const closedCount = positions.filter(p => p.closed).length;
        const winCount = positions.filter(p => p.closed && p.winningOutcome && p.outcome &&
          p.winningOutcome.toLowerCase() === p.outcome.toLowerCase()).length;

        const prompt = `You are analysing a Polymarket prediction market trader.

Recent trades (up to 15): ${recentTrades.map(t => `${t.type} ${t.outcome} on "${t.title}" @ ${Math.round((t.price||0)*100)}¢`).join(' | ')}

Open positions (up to 10): ${openPos.map(p => `${p.outcome} on "${p.title}" PnL $${(p.cashPnl||0).toFixed(0)}`).join(' | ')}

Stats: ${closedCount} closed positions, ${winCount} wins, win rate ${closedCount > 0 ? Math.round(winCount/closedCount*100) : 'N/A'}%

Write a 1-2 sentence trader profile. Focus on: what markets they specialise in, their style (momentum/contrarian/value), and any notable pattern. Be specific, not generic. Max 40 words.`;

        const gRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.4, maxOutputTokens: 80 },
            }),
          }
        );
        if (gRes.ok) {
          const gData = await gRes.json();
          ai_summary = gData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
        }
      } catch {}
    }

    // ── Update wallet row ─────────────────────────────────────────────────────
    await fetch(`${SB_URL()}/rest/v1/wallets?address=eq.${address}`, {
      method: 'PATCH',
      headers: sbHeaders({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify({
        win_rate,
        total_pnl,
        open_positions,
        last_refreshed_at: new Date().toISOString(),
        portfolio_value,
        ...(ai_summary ? { ai_summary } : {}),
      }),
    });

    return res.status(200).json({
      trades: trades.length,
      positions: positions.length,
      win_rate,
      total_pnl,
      portfolio_value,
      open_positions,
      ai_summary,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
