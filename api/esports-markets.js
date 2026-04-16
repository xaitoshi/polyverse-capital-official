// Search Polymarket Gamma for active LoL esports markets matching two team names
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { team1, team2 } = req.query;
  if (!team1 || !team2) return res.status(400).json({ error: 'Missing team1 or team2' });

  try {
    // Search for markets mentioning both teams
    const q = encodeURIComponent(`${team1} ${team2}`);
    const url = `https://gamma-api.polymarket.com/markets?active=true&closed=false&q=${q}&limit=20&order=volume&ascending=false`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
    if (!r.ok) throw new Error(`Gamma ${r.status}`);
    const markets = await r.json();

    // Filter to markets that mention both team names (case-insensitive)
    const t1 = team1.toLowerCase();
    const t2 = team2.toLowerCase();
    const filtered = (Array.isArray(markets) ? markets : []).filter(m => {
      const text = (m.question ?? '').toLowerCase();
      return text.includes(t1) && text.includes(t2);
    });

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=10');
    return res.status(200).json(filtered);
  } catch (e) {
    return res.status(500).json({ error: e.message ?? 'Unknown error' });
  }
}
