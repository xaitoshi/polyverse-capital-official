// Returns trades + positions for a single wallet from Supabase

const SB_URL = () => process.env.SUPABASE_URL;
const SB_KEY = () => process.env.SUPABASE_SERVICE_KEY;

const sbHeaders = () => ({
  'apikey': SB_KEY(),
  'Authorization': `Bearer ${SB_KEY()}`,
  'Content-Type': 'application/json',
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { address } = req.query;
  if (!address) return res.status(400).json({ error: 'address required' });

  const [tradesRes, posRes] = await Promise.all([
    fetch(
      `${SB_URL()}/rest/v1/wallet_trades?wallet_address=eq.${address}&order=timestamp.desc&limit=50`,
      { headers: sbHeaders() }
    ),
    fetch(
      `${SB_URL()}/rest/v1/wallet_positions?wallet_address=eq.${address}&order=cash_pnl.desc`,
      { headers: sbHeaders() }
    ),
  ]);

  const [trades, positions] = await Promise.all([tradesRes.json(), posRes.json()]);

  return res.status(200).json({ trades, positions });
}
