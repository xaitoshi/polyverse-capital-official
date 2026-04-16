// Fetches live + upcoming LoL esports matches and enriches with Polymarket odds
const LOL_API_KEY = '0TvQnueqKa5mxJntVWt0w4LpLfEkrV1Ta8rQBb9Z';
const MAJOR_LEAGUES = ['lck', 'lpl', 'lec', 'lcs', 'msi', 'worlds'];

async function fetchSchedule() {
  const r = await fetch(
    'https://esports-api.lolesports.com/persisted/gw/getSchedule?hl=en-US',
    { headers: { 'x-api-key': LOL_API_KEY } }
  );
  if (!r.ok) throw new Error(`LoL Esports API ${r.status}`);
  const data = await r.json();
  return data.data?.schedule?.events ?? [];
}

async function fetchPolymarketOdds(team1, team2, leagueName) {
  const queries = [
    `${team1} ${team2}`,
    `${team1} ${leagueName}`,
  ];
  const markets = [];
  for (const q of queries) {
    try {
      const r = await fetch(
        `https://gamma-api.polymarket.com/markets?active=true&closed=false&q=${encodeURIComponent(q)}&limit=10&order=volume&ascending=false`,
        { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
      );
      if (!r.ok) continue;
      const data = await r.json();
      if (!Array.isArray(data)) continue;
      const t1l = team1.toLowerCase(), t2l = team2.toLowerCase();
      for (const m of data) {
        const text = (m.question ?? '').toLowerCase();
        if ((text.includes(t1l) || text.includes(team1.slice(0,3).toLowerCase())) &&
            (text.includes(t2l) || text.includes(team2.slice(0,3).toLowerCase()))) {
          if (!markets.find(x => x.id === m.id)) markets.push(m);
        }
      }
    } catch { /* skip */ }
  }
  return markets.slice(0, 3);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    const events = await fetchSchedule();

    const now = Date.now();
    const cutoff = now + 48 * 3600 * 1000; // next 48 hours

    const relevant = events.filter(e => {
      if (e.type !== 'match') return false;
      const slug = e.league?.slug?.toLowerCase() ?? '';
      if (!MAJOR_LEAGUES.some(l => slug.includes(l))) return false;
      if (e.state === 'inProgress') return true;
      if (e.state === 'unstarted') {
        const t = new Date(e.startTime).getTime();
        return t > now && t < cutoff;
      }
      return false;
    });

    // Enrich with Polymarket odds in parallel (throttle to avoid hammering)
    const enriched = await Promise.all(
      relevant.map(async e => {
        const teams = e.match?.teams ?? [];
        const [t1, t2] = teams;
        let markets = [];
        if (t1?.name && t2?.name) {
          markets = await fetchPolymarketOdds(t1.name, t2.name, e.league?.name ?? '');
        }
        return {
          id: e.match?.id ?? e.startTime,
          state: e.state,
          startTime: e.startTime,
          league: { name: e.league?.name, slug: e.league?.slug },
          blockName: e.blockName,
          strategy: e.match?.strategy,
          teams: teams.map(t => ({
            name: t.name,
            code: t.code,
            image: t.image,
            result: t.result ?? null,
          })),
          markets,
        };
      })
    );

    const live     = enriched.filter(e => e.state === 'inProgress');
    const upcoming = enriched.filter(e => e.state === 'unstarted')
                             .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json({ live, upcoming });
  } catch (err) {
    console.error('esports-schedule error:', err);
    return res.status(500).json({ error: err.message });
  }
}
