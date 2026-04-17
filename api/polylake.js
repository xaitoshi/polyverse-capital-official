// Bundled polylake handler — routes by ?action=
// Replaces: polylake/wallets, polylake/detail, polylake/refresh,
//           polylake/discover, polylake/chat, polylake/test

const SB_URL  = () => process.env.SUPABASE_URL;
const SB_KEY  = () => process.env.SUPABASE_SERVICE_KEY;
const GEM_KEY = () => process.env.GEMINI_API_KEY;

const sbHeaders = (extra = {}) => ({
  'apikey': SB_KEY(),
  'Authorization': `Bearer ${SB_KEY()}`,
  'Content-Type': 'application/json',
  ...extra,
});

const fmtPct  = v => v != null ? `${Math.round(v * 100)}%` : 'N/A';
const fmtUsd  = v => v != null ? `$${Number(v).toFixed(2)}` : 'N/A';
const truncAddr = a => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';

async function sbUpsert(table, rows) {
  if (!rows.length) return;
  return fetch(`${SB_URL()}/rest/v1/${table}`, {
    method: 'POST',
    headers: sbHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(rows),
  });
}

async function callGemini(prompt, opts = {}) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEM_KEY()}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], ...opts }) }
  );
  if (!r.ok) { const t = await r.text(); throw new Error(`Gemini ${r.status}: ${t}`); }
  const data = await r.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Derive action from ?action= or from the URL path segment (/api/polylake/wallets → wallets)
  const action = req.query.action
    || req.url?.split('?')[0].split('/').filter(Boolean).pop();

  // ── wallets ──────────────────────────────────────────────────────────────────
  if (action === 'wallets') {
    if (!SB_URL() || !SB_KEY()) return res.status(500).json({ error: 'Supabase not configured' });

    if (req.method === 'GET') {
      const r = await fetch(`${SB_URL()}/rest/v1/wallets?select=*&order=added_at.desc`, { headers: sbHeaders() });
      return res.status(200).json(await r.json());
    }

    if (req.method === 'POST') {
      let { address, label, category } = req.body;
      if (!address) return res.status(400).json({ error: 'address required' });
      if (address.startsWith('@')) {
        const username = address.slice(1);
        try {
          const r = await fetch(`https://data-api.polymarket.com/profiles?username=${username}`, { headers: { Accept: 'application/json' } });
          if (r.ok) {
            const data = await r.json();
            const profile = Array.isArray(data) ? data[0] : data;
            const resolved = profile?.address || profile?.proxyWallet || profile?.walletAddress;
            if (!resolved) return res.status(404).json({ error: `Could not resolve @${username} to a wallet address` });
            address = resolved;
          } else return res.status(404).json({ error: `Polymarket username @${username} not found` });
        } catch (e) { return res.status(500).json({ error: `Failed to resolve username: ${e.message}` }); }
      }
      const check = await fetch(`${SB_URL()}/rest/v1/wallets?address=eq.${address}&select=address`, { headers: sbHeaders() });
      if ((await check.json()).length > 0) return res.status(409).json({ error: 'Wallet already tracked' });
      let display_name = null, pfp_url = null;
      try {
        const profileRes = await fetch(`https://data-api.polymarket.com/profiles?address=${address}`, { headers: { Accept: 'application/json' } });
        if (profileRes.ok) {
          const profiles = await profileRes.json();
          if (profiles?.length > 0) { display_name = profiles[0]?.name || profiles[0]?.displayName || null; pfp_url = profiles[0]?.profileImage || profiles[0]?.pfpUrl || null; }
        }
      } catch {}
      const r = await fetch(`${SB_URL()}/rest/v1/wallets`, { method: 'POST', headers: sbHeaders({ 'Prefer': 'return=representation' }), body: JSON.stringify({ address, label: label || null, category: category || 'Uncategorized', display_name, pfp_url }) });
      const data = await r.json();
      return res.status(201).json(Array.isArray(data) ? data[0] : data);
    }

    if (req.method === 'PATCH') {
      const { address, ...updates } = req.body;
      if (!address) return res.status(400).json({ error: 'address required' });
      const r = await fetch(`${SB_URL()}/rest/v1/wallets?address=eq.${address}`, { method: 'PATCH', headers: sbHeaders({ 'Prefer': 'return=representation' }), body: JSON.stringify(updates) });
      return res.status(200).json(await r.json());
    }

    if (req.method === 'DELETE') {
      const address = req.query.address;
      if (!address) return res.status(400).json({ error: 'address required' });
      await fetch(`${SB_URL()}/rest/v1/wallets?address=eq.${address}`, { method: 'DELETE', headers: sbHeaders() });
      return res.status(204).end();
    }

    return res.status(405).end();
  }

  // ── detail ───────────────────────────────────────────────────────────────────
  if (action === 'detail') {
    if (req.method !== 'GET') return res.status(405).end();
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: 'address required' });
    const [tradesRes, posRes] = await Promise.all([
      fetch(`${SB_URL()}/rest/v1/wallet_trades?wallet_address=eq.${address}&order=timestamp.desc&limit=50`, { headers: sbHeaders() }),
      fetch(`${SB_URL()}/rest/v1/wallet_positions?wallet_address=eq.${address}&order=cash_pnl.desc`, { headers: sbHeaders() }),
    ]);
    const [trades, positions] = await Promise.all([tradesRes.json(), posRes.json()]);
    return res.status(200).json({ trades, positions });
  }

  // ── refresh ──────────────────────────────────────────────────────────────────
  if (action === 'refresh') {
    if (req.method !== 'POST') return res.status(405).end();
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: 'address required' });
    try {
      let trades = [], positions = [];
      try {
        const r = await fetch(`https://data-api.polymarket.com/activity?user=${address}&limit=500`, { headers: { Accept: 'application/json' } });
        if (r.ok) trades = await r.json();
      } catch {}
      try {
        const r = await fetch(`https://data-api.polymarket.com/positions?user=${address}&limit=500&offset=0&sizeThreshold=.001`, { headers: { Accept: 'application/json' } });
        if (r.ok) positions = await r.json();
      } catch {}

      const tradesToStore = trades.slice(0, 100);
      if (tradesToStore.length > 0) {
        await sbUpsert('wallet_trades', tradesToStore.map(t => ({
          wallet_address: address,
          trade_id: t.id || t.transactionHash || `${address}-${t.timestamp}`,
          timestamp: t.timestamp ? new Date(Number(t.timestamp) * 1000).toISOString() : null,
          type: t.side ?? t.type ?? 'TRADE',
          outcome: t.outcome ?? '', title: t.title ?? t.market ?? '', slug: t.slug ?? '',
          price: Number(t.price ?? 0), size: Number(t.size ?? 0),
          usdc_size: Number(t.usdcSize ?? t.amount ?? 0), transaction_hash: t.transactionHash ?? '',
        })));
      }
      if (positions.length > 0) {
        await sbUpsert('wallet_positions', positions.map(p => ({
          wallet_address: address, condition_id: p.conditionId, title: p.title, slug: p.slug,
          outcome: p.outcome, size: p.size, avg_price: p.avgPrice, initial_value: p.initialValue,
          current_value: p.currentValue, cash_pnl: p.cashPnl, percent_pnl: p.percentPnl,
          end_date: p.endDate, closed: p.closed ?? false, winning_outcome: p.winningOutcome ?? null,
          last_updated: new Date().toISOString(),
        })));
      }

      const buyMarkets    = new Set(trades.filter(t => (t.side ?? t.type) === 'BUY').map(t => t.slug || t.conditionId).filter(Boolean));
      const redeemMarkets = new Set(trades.filter(t => (t.side ?? t.type) === 'REDEEM').map(t => t.slug || t.conditionId).filter(Boolean));
      const win_rate = buyMarkets.size > 0 ? redeemMarkets.size / buyMarkets.size : null;
      const openPositions  = positions.filter(p => !p.closed);
      const total_pnl      = openPositions.reduce((s, p) => s + (p.cashPnl || 0), 0);
      const portfolio_value = openPositions.reduce((s, p) => s + (p.currentValue || 0), 0);
      const open_positions = openPositions.length;

      let ai_summary = null;
      if (GEM_KEY() && (trades.length > 0 || positions.length > 0)) {
        try {
          const openPos      = positions.filter(p => !p.closed).slice(0, 10);
          const recentTrades = trades.slice(0, 15);
          const closedCount  = positions.filter(p => p.closed).length;
          const winCount     = positions.filter(p => p.closed && p.winningOutcome && p.outcome && p.winningOutcome.toLowerCase() === p.outcome.toLowerCase()).length;
          const prompt = `You are analysing a Polymarket prediction market trader.\n\nRecent trades (up to 15): ${recentTrades.map(t => `${t.type} ${t.outcome} on "${t.title}" @ ${Math.round((t.price||0)*100)}¢`).join(' | ')}\n\nOpen positions (up to 10): ${openPos.map(p => `${p.outcome} on "${p.title}" PnL $${(p.cashPnl||0).toFixed(0)}`).join(' | ')}\n\nStats: ${closedCount} closed positions, ${winCount} wins, win rate ${closedCount > 0 ? Math.round(winCount/closedCount*100) : 'N/A'}%\n\nWrite a 1-2 sentence trader profile. Focus on: what markets they specialise in, their style (momentum/contrarian/value), and any notable pattern. Be specific, not generic. Max 40 words.`;
          const text = await callGemini(prompt, { generationConfig: { temperature: 0.4, maxOutputTokens: 80 } });
          ai_summary = text.trim() || null;
        } catch {}
      }

      await fetch(`${SB_URL()}/rest/v1/wallets?address=eq.${address}`, {
        method: 'PATCH',
        headers: sbHeaders({ 'Prefer': 'return=minimal' }),
        body: JSON.stringify({ win_rate, total_pnl, open_positions, last_refreshed_at: new Date().toISOString(), portfolio_value, ...(ai_summary ? { ai_summary } : {}) }),
      });

      return res.status(200).json({ trades: trades.length, positions: positions.length, win_rate, total_pnl, portfolio_value, open_positions, ai_summary });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── discover ─────────────────────────────────────────────────────────────────
  if (action === 'discover') {
    if (req.method !== 'GET') return res.status(405).end();
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url required' });
    const slugMatch = url.match(/polymarket\.com\/event\/([^/?#]+)/i);
    if (!slugMatch) return res.status(400).json({ error: 'Could not parse event slug from URL' });
    const slug = slugMatch[1];
    try {
      const eventRes = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}&limit=1`, { headers: { Accept: 'application/json' } });
      if (!eventRes.ok) return res.status(502).json({ error: `Gamma API error: ${eventRes.status}` });
      const events = await eventRes.json();
      const event = Array.isArray(events) ? events[0] : events;
      if (!event) return res.status(404).json({ error: `Event not found for slug: ${slug}` });
      const markets = event.markets ?? [];
      if (markets.length === 0) return res.status(404).json({ error: 'No markets found in event' });
      const conditionIds = markets.map(m => m.conditionId).filter(Boolean);

      let leaderboardUsers = [];
      try {
        const lbRes = await fetch(`https://data-api.polymarket.com/leaderboard?interval=all&limit=100&offset=0`, { headers: { Accept: 'application/json' } });
        if (lbRes.ok) {
          const lbData = await lbRes.json();
          const arr = Array.isArray(lbData) ? lbData : (lbData?.data ?? lbData?.accounts ?? []);
          leaderboardUsers = arr.map(u => u.proxyWallet ?? u.address ?? u.user ?? u.id).filter(Boolean);
        }
      } catch {}

      if (leaderboardUsers.length === 0) return res.status(200).json({ event: { title: event.title, slug }, wallets: [], message: 'Polymarket leaderboard returned no data.' });

      const results = [];
      for (let i = 0; i < Math.min(leaderboardUsers.length, 80); i += 10) {
        const batch = leaderboardUsers.slice(i, i + 10);
        const batchResults = await Promise.all(batch.map(async userAddr => {
          try {
            const r = await fetch(`https://data-api.polymarket.com/positions?user=${userAddr}&limit=500&sizeThreshold=0`, { headers: { Accept: 'application/json' } });
            if (!r.ok) return null;
            const positions = await r.json();
            if (!Array.isArray(positions)) return null;
            const marketPositions = positions.filter(p => conditionIds.includes(p.conditionId));
            if (marketPositions.length === 0) return null;
            return {
              user: userAddr,
              positions: marketPositions.map(p => ({ outcome: p.outcome, size: Number(p.size ?? 0), avgPrice: Number(p.avgPrice ?? 0), currentValue: Number(p.currentValue ?? 0), cashPnl: Number(p.cashPnl ?? 0) })),
              totalSize: marketPositions.reduce((s, p) => s + Number(p.size ?? 0), 0),
              totalPnl:  marketPositions.reduce((s, p) => s + Number(p.cashPnl ?? 0), 0),
              totalValue: marketPositions.reduce((s, p) => s + Number(p.currentValue ?? 0), 0),
            };
          } catch { return null; }
        }));
        results.push(...batchResults.filter(Boolean));
      }

      if (results.length === 0) return res.status(200).json({ event: { title: event.title, slug }, wallets: [], message: `Checked ${Math.min(leaderboardUsers.length, 80)} top traders — none have open positions in this market.` });

      const ranked = results.sort((a, b) => b.totalSize - a.totalSize).slice(0, 30);
      await Promise.all(ranked.slice(0, 15).map(async w => {
        try {
          const r = await fetch(`https://data-api.polymarket.com/profiles?address=${w.user}`, { headers: { Accept: 'application/json' } });
          if (r.ok) { const profiles = await r.json(); const p = Array.isArray(profiles) ? profiles[0] : profiles; w.displayName = p?.name || p?.displayName || null; w.pfpUrl = p?.profileImage || p?.pfpUrl || null; w.username = p?.username || null; }
        } catch {}
      }));
      return res.status(200).json({ event: { title: event.title, slug, markets: markets.length }, wallets: ranked });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── chat ─────────────────────────────────────────────────────────────────────
  if (action === 'chat') {
    if (req.method !== 'POST') return res.status(405).end();
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });
    if (!GEM_KEY()) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

    const [walletsRes, tradesRes, positionsRes] = await Promise.all([
      fetch(`${SB_URL()}/rest/v1/wallets?select=*&order=added_at.desc`, { headers: sbHeaders() }),
      fetch(`${SB_URL()}/rest/v1/wallet_trades?select=*&order=timestamp.desc&limit=200`, { headers: sbHeaders() }),
      fetch(`${SB_URL()}/rest/v1/wallet_positions?select=*&order=cash_pnl.desc&limit=300`, { headers: sbHeaders() }),
    ]);
    const [wallets, trades, positions] = await Promise.all([walletsRes.json(), tradesRes.json(), positionsRes.json()]);

    const walletLines = (wallets || []).map(w => `• ${w.display_name || truncAddr(w.address)} (${w.address}) | Category: ${w.category} | Label: ${w.label || 'none'} | Win Rate: ${fmtPct(w.win_rate)} | Open PnL: ${fmtUsd(w.total_pnl)} | Open Positions: ${w.open_positions ?? 0} | Last Refreshed: ${w.last_refreshed_at ? new Date(w.last_refreshed_at).toLocaleDateString() : 'never'}`).join('\n');
    const tradesByWallet = {};
    (trades || []).forEach(t => { if (!tradesByWallet[t.wallet_address]) tradesByWallet[t.wallet_address] = []; tradesByWallet[t.wallet_address].push(t); });
    const recentTradeLines = (wallets || []).flatMap(w => (tradesByWallet[w.address] || []).slice(0, 5).map(t => `  ${w.display_name || truncAddr(w.address)}: ${t.type} ${t.outcome} on "${t.title}" @ ${Math.round((t.price || 0) * 100)}¢ (${fmtUsd(t.usdc_size)}) [${t.timestamp ? new Date(t.timestamp).toLocaleDateString() : '?'}]`)).join('\n');
    const openPositions = (positions || []).filter(p => !p.closed);
    const positionLines = openPositions.slice(0, 30).map(p => { const wallet = (wallets || []).find(w => w.address === p.wallet_address); return `  ${wallet?.display_name || truncAddr(p.wallet_address)}: ${p.outcome} on "${p.title}" | PnL: ${fmtUsd(p.cash_pnl)} (${fmtPct(p.percent_pnl)}) | avg @ ${Math.round((p.avg_price || 0) * 100)}¢`; }).join('\n');
    const categoryCounts = {};
    (wallets || []).forEach(w => { categoryCounts[w.category] = (categoryCounts[w.category] || 0) + 1; });
    const categoryLines = Object.entries(categoryCounts).map(([cat, count]) => `  ${cat}: ${count} wallets`).join('\n');

    const context = `You are PolyLake AI, an analyst for a Polymarket wallet tracking system called PolyLake on polyverse.capital.\n\nYou have access to the following real-time data about tracked wallets:\n\nTRACKED WALLETS (${(wallets || []).length} total):\n${walletLines || 'No wallets tracked yet.'}\n\nCATEGORIES:\n${categoryLines || 'No categories yet.'}\n\nRECENT TRADES:\n${recentTradeLines || 'No recent trade data.'}\n\nOPEN POSITIONS (sorted by PnL):\n${positionLines || 'No open position data.'}\n\nAnswer the user's question based on this data. Be concise and specific. Reference wallet names/addresses and specific markets. If data is missing, say so. Format numbers clearly (use % for win rates, $ for PnL).`;

    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEM_KEY()}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: context + '\n\nUser question: ' + message }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 1024 } }) }
      );
      if (!r.ok) { const txt = await r.text(); return res.status(502).json({ error: `Gemini error: ${txt}` }); }
      const data = await r.json();
      return res.status(200).json({ reply: data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response.' });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── test ─────────────────────────────────────────────────────────────────────
  if (action === 'test') {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
    const result = { supabase_url: url ? `${url.slice(0, 30)}...` : 'MISSING', supabase_key: key ? `${key.slice(0, 10)}...` : 'MISSING', configured: !!(url && key) };
    if (!url || !key) return res.status(500).json({ ...result, error: 'Supabase env vars missing' });
    try {
      const r = await fetch(`${url}/rest/v1/wallets?limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      const text = await r.text();
      let body; try { body = JSON.parse(text); } catch { body = text; }
      return res.status(200).json({ ...result, supabase_status: r.status, supabase_response: body, table_exists: r.ok });
    } catch (e) {
      return res.status(500).json({ ...result, error: e.message });
    }
  }

  return res.status(400).json({ error: 'Missing or unknown action. Use ?action=wallets|detail|refresh|discover|chat|test' });
}
