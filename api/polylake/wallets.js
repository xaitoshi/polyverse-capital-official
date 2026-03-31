const SB_URL = () => process.env.SUPABASE_URL;
const SB_KEY = () => process.env.SUPABASE_SERVICE_KEY;

const sbHeaders = () => ({
  'apikey': SB_KEY(),
  'Authorization': `Bearer ${SB_KEY()}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!SB_URL() || !SB_KEY()) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  // GET — list all wallets
  if (req.method === 'GET') {
    const r = await fetch(
      `${SB_URL()}/rest/v1/wallets?select=*&order=added_at.desc`,
      { headers: sbHeaders() }
    );
    const data = await r.json();
    return res.status(200).json(data);
  }

  // POST — add new wallet
  if (req.method === 'POST') {
    const { address, label, category } = req.body;
    if (!address) return res.status(400).json({ error: 'address required' });

    // Check duplicate
    const check = await fetch(
      `${SB_URL()}/rest/v1/wallets?address=eq.${address}&select=address`,
      { headers: sbHeaders() }
    );
    const existing = await check.json();
    if (existing.length > 0) return res.status(409).json({ error: 'Wallet already tracked' });

    // Fetch Polymarket profile
    let display_name = null, pfp_url = null;
    try {
      const profileRes = await fetch(
        `https://data-api.polymarket.com/profiles?address=${address}`,
        { headers: { 'Accept': 'application/json' } }
      );
      if (profileRes.ok) {
        const profiles = await profileRes.json();
        if (profiles?.length > 0) {
          display_name = profiles[0]?.name || profiles[0]?.displayName || null;
          pfp_url = profiles[0]?.profileImage || profiles[0]?.pfpUrl || null;
        }
      }
    } catch {}

    const r = await fetch(`${SB_URL()}/rest/v1/wallets`, {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify({
        address,
        label: label || null,
        category: category || 'Uncategorized',
        display_name,
        pfp_url,
      }),
    });
    const data = await r.json();
    return res.status(201).json(Array.isArray(data) ? data[0] : data);
  }

  // PATCH — update label / category / notes
  if (req.method === 'PATCH') {
    const { address, ...updates } = req.body;
    if (!address) return res.status(400).json({ error: 'address required' });
    const r = await fetch(
      `${SB_URL()}/rest/v1/wallets?address=eq.${address}`,
      { method: 'PATCH', headers: sbHeaders(), body: JSON.stringify(updates) }
    );
    const data = await r.json();
    return res.status(200).json(data);
  }

  // DELETE — remove wallet (cascades trades + positions)
  if (req.method === 'DELETE') {
    const address = req.query.address;
    if (!address) return res.status(400).json({ error: 'address required' });
    await fetch(`${SB_URL()}/rest/v1/wallets?address=eq.${address}`, {
      method: 'DELETE',
      headers: sbHeaders(),
    });
    return res.status(204).end();
  }

  return res.status(405).end();
}
