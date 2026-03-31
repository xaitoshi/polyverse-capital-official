// AI chat — builds context from Supabase wallet data, queries Gemini

const SB_URL = () => process.env.SUPABASE_URL;
const SB_KEY = () => process.env.SUPABASE_SERVICE_KEY;
const GEMINI_KEY = () => process.env.GEMINI_API_KEY;

const sbHeaders = () => ({
  'apikey': SB_KEY(),
  'Authorization': `Bearer ${SB_KEY()}`,
  'Content-Type': 'application/json',
});

const fmtPct = v => v != null ? `${Math.round(v * 100)}%` : 'N/A';
const fmtUsd = v => v != null ? `$${Number(v).toFixed(2)}` : 'N/A';
const truncAddr = a => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { message, history = [] } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  if (!GEMINI_KEY()) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  // ── Fetch context from Supabase ───────────────────────────────────────────
  const [walletsRes, tradesRes, positionsRes] = await Promise.all([
    fetch(`${SB_URL()}/rest/v1/wallets?select=*&order=added_at.desc`, { headers: sbHeaders() }),
    fetch(`${SB_URL()}/rest/v1/wallet_trades?select=*&order=timestamp.desc&limit=200`, { headers: sbHeaders() }),
    fetch(`${SB_URL()}/rest/v1/wallet_positions?select=*&order=cash_pnl.desc&limit=300`, { headers: sbHeaders() }),
  ]);

  const [wallets, trades, positions] = await Promise.all([
    walletsRes.json(), tradesRes.json(), positionsRes.json()
  ]);

  // ── Build context string ──────────────────────────────────────────────────
  const walletLines = (wallets || []).map(w =>
    `• ${w.display_name || truncAddr(w.address)} (${w.address}) | Category: ${w.category} | Label: ${w.label || 'none'} | Win Rate: ${fmtPct(w.win_rate)} | Open PnL: ${fmtUsd(w.total_pnl)} | Open Positions: ${w.open_positions ?? 0} | Last Refreshed: ${w.last_refreshed_at ? new Date(w.last_refreshed_at).toLocaleDateString() : 'never'}`
  ).join('\n');

  // Group recent trades by wallet
  const tradesByWallet = {};
  (trades || []).forEach(t => {
    if (!tradesByWallet[t.wallet_address]) tradesByWallet[t.wallet_address] = [];
    tradesByWallet[t.wallet_address].push(t);
  });

  // Recent trades summary (last 5 per wallet)
  const recentTradeLines = (wallets || []).flatMap(w => {
    const wt = (tradesByWallet[w.address] || []).slice(0, 5);
    return wt.map(t =>
      `  ${w.display_name || truncAddr(w.address)}: ${t.type} ${t.outcome} on "${t.title}" @ ${Math.round((t.price || 0) * 100)}¢ (${fmtUsd(t.usdc_size)}) [${t.timestamp ? new Date(t.timestamp).toLocaleDateString() : '?'}]`
    );
  }).join('\n');

  // Open positions with best/worst PnL
  const openPositions = (positions || []).filter(p => !p.closed);
  const positionLines = openPositions.slice(0, 30).map(p => {
    const wallet = (wallets || []).find(w => w.address === p.wallet_address);
    const name = wallet?.display_name || truncAddr(p.wallet_address);
    return `  ${name}: ${p.outcome} on "${p.title}" | PnL: ${fmtUsd(p.cash_pnl)} (${fmtPct(p.percent_pnl)}) | avg @ ${Math.round((p.avg_price || 0) * 100)}¢`;
  }).join('\n');

  // Category breakdown
  const categoryCounts = {};
  (wallets || []).forEach(w => {
    categoryCounts[w.category] = (categoryCounts[w.category] || 0) + 1;
  });
  const categoryLines = Object.entries(categoryCounts)
    .map(([cat, count]) => `  ${cat}: ${count} wallets`)
    .join('\n');

  const context = `You are PolyLake AI, an analyst for a Polymarket wallet tracking system called PolyLake on polyverse.capital.

You have access to the following real-time data about tracked wallets:

TRACKED WALLETS (${(wallets || []).length} total):
${walletLines || 'No wallets tracked yet.'}

CATEGORIES:
${categoryLines || 'No categories yet.'}

RECENT TRADES:
${recentTradeLines || 'No recent trade data.'}

OPEN POSITIONS (sorted by PnL):
${positionLines || 'No open position data.'}

Answer the user's question based on this data. Be concise and specific. Reference wallet names/addresses and specific markets. If data is missing, say so. Format numbers clearly (use % for win rates, $ for PnL).`;

  // ── Build Gemini conversation ─────────────────────────────────────────────
  const contents = [
    {
      role: 'user',
      parts: [{ text: context + '\n\nUser question: ' + message }],
    }
  ];

  // Append prior turns if any (alternating user/model)
  // We keep it simple — just the context + current message for now

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const txt = await geminiRes.text();
      return res.status(502).json({ error: `Gemini error: ${txt}` });
    }

    const data = await geminiRes.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response.';
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
