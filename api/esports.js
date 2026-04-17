// Bundled esports handler — routes by ?action=
// Replaces: esports-schedule, esports-markets, esports-analysis,
//           esports-stats, save-esports-game, gemini-scan
import { createClient } from '@supabase/supabase-js';

// ── esports-schedule helpers ──────────────────────────────────────────────────
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

// Normalise a team name for fuzzy matching:
// "Gen.G" → "geng", "Anyone's Legend" → "anyones legend", "T1" → "t1"
function normTeam(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

// Fetch all active esports events from Polymarket once and cache per request
async function fetchEsportsEvents() {
  const r = await fetch(
    'https://gamma-api.polymarket.com/events?active=true&closed=false&tag_slug=esports&limit=200&order=volume&ascending=false',
    { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
  );
  if (!r.ok) return [];
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

// Map a Polymarket event + one of its markets to the shape the frontend expects
function mapMarket(event, market) {
  return {
    id:           market.id   ?? event.id,
    question:     market.question ?? event.title,
    outcomePrices: market.outcomePrices ?? '[]',
    outcomes:     market.outcomes ?? '["Yes","No"]',
    url:          event.slug  ?? market.slug ?? '',
    volume:       market.volume ?? event.volume ?? '0',
  };
}

function matchesTeams(eventTitle, t1name, t1code, t2name, t2code) {
  const title = normTeam(eventTitle);
  const n1 = normTeam(t1name), n2 = normTeam(t2name);
  const c1 = (t1code || '').toLowerCase(), c2 = (t2code || '').toLowerCase();
  const hasT1 = (n1 && title.includes(n1)) || (c1 && title.includes(c1));
  const hasT2 = (n2 && title.includes(n2)) || (c2 && title.includes(c2));
  return hasT1 && hasT2;
}

function findMarketsForMatch(esportsEvents, t1name, t1code, t2name, t2code) {
  const matched = esportsEvents.filter(e =>
    matchesTeams(e.title ?? '', t1name, t1code, t2name, t2code)
  );
  // Return up to 3 markets from matching events (prefer the win/BO market)
  const out = [];
  for (const event of matched) {
    const markets = event.markets ?? [];
    // Prefer the head-to-head "who wins" market (shorter question, no handicap)
    const sorted = [...markets].sort((a, b) => (a.question?.length ?? 0) - (b.question?.length ?? 0));
    for (const m of sorted.slice(0, 2)) {
      if (!out.find(x => x.id === m.id)) out.push(mapMarket(event, m));
    }
    if (out.length >= 3) break;
  }
  return out;
}

// ── Gemini helper ─────────────────────────────────────────────────────────────
async function callGemini(key, body) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  if (!r.ok) { const t = await r.text(); throw new Error(`Gemini ${r.status}: ${t}`); }
  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const action = req.query.action;

  // ── schedule ────────────────────────────────────────────────────────────────
  if (action === 'schedule') {
    if (req.method !== 'GET') return res.status(405).end();
    try {
      const events = await fetchSchedule();
      const now = Date.now(), cutoff = now + 48 * 3600 * 1000;
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
      const esportsEvents = await fetchEsportsEvents();
      const enriched = await Promise.all(relevant.map(async e => {
        const teams = e.match?.teams ?? [];
        const [t1, t2] = teams;
        let markets = [];
        if (t1?.name && t2?.name) markets = findMarketsForMatch(esportsEvents, t1.name, t1.code, t2.name, t2.code);
        return {
          id: e.match?.id ?? e.startTime, state: e.state, startTime: e.startTime,
          league: { name: e.league?.name, slug: e.league?.slug },
          blockName: e.blockName, strategy: e.match?.strategy,
          teams: teams.map(t => ({ name: t.name, code: t.code, image: t.image, result: t.result ?? null })),
          markets,
        };
      }));
      const live     = enriched.filter(e => e.state === 'inProgress');
      const upcoming = enriched.filter(e => e.state === 'unstarted')
                               .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
      return res.status(200).json({ live, upcoming });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── markets ─────────────────────────────────────────────────────────────────
  if (action === 'markets') {
    if (req.method !== 'GET') return res.status(405).end();
    const { team1, team2 } = req.query;
    if (!team1 || !team2) return res.status(400).json({ error: 'Missing team1 or team2' });
    try {
      const esportsEvents = await fetchEsportsEvents();
      const markets = findMarketsForMatch(esportsEvents, team1, '', team2, '');
      return res.status(200).json(markets);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── analysis ─────────────────────────────────────────────────────────────────
  if (action === 'analysis') {
    if (req.method !== 'POST') return res.status(405).end();
    const { blueTeam, redTeam, history, polyOdds, modelProb } = req.body;
    if (!history?.length) return res.status(400).json({ error: 'No history provided' });
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    const startTime = history[0].timestamp;
    const rows = history.map((s, i) => {
      const elapsed = Math.round((s.timestamp - startTime) / 1000);
      const goldDiff  = s.blue.gold    - s.red.gold;
      const killDiff  = s.blue.kills   - s.red.kills;
      const towerDiff = s.blue.towers  - s.red.towers;
      const dragDiff  = s.blue.dragons - s.red.dragons;
      return `Snap ${i + 1} (${s.gameTime ?? `+${elapsed}s`}): gold ${goldDiff > 0 ? '+' : ''}${goldDiff}, kills ${killDiff > 0 ? '+' : ''}${killDiff}, towers ${towerDiff > 0 ? '+' : ''}${towerDiff}, dragons ${dragDiff > 0 ? '+' : ''}${dragDiff} — Blue: ${JSON.stringify(s.blue)} | Red: ${JSON.stringify(s.red)}`;
    }).join('\n');
    const polyLine  = polyOdds?.length ? `\nPolymarket live odds: ${polyOdds.map(m => `"${m.question}" → ${m.prices}`).join('; ')}` : '';
    const modelLine = modelProb ? `\nModel win prediction (historical stats): ${blueTeam} ${Math.round(modelProb * 100)}% vs ${redTeam} ${Math.round((1 - modelProb) * 100)}%` : '';
    const prompt = `You are an expert League of Legends esports analyst. You have been given a series of in-game stat snapshots captured every ~15 seconds from a live broadcast.\n\nTeams: ${blueTeam || 'Blue'} (blue side) vs ${redTeam || 'Red'} (red side)\n${modelLine}${polyLine}\n\nSnapshot data (all diffs are Blue minus Red):\n${rows}\n\nPlease provide:\n1. A concise narrative of how the game progressed based on the data\n2. The exact snapshot number and game time where you first had HIGH CONFIDENCE (>70%) about which team would likely win, and why that snapshot was the turning point\n3. What the key deciding factors were (gold lead, objective control, kill differential etc.)\n4. Your final prediction of the likely winner with a confidence %\n\nReturn ONLY clean JSON in this exact format with no extra text:\n{\n  "narrative": "2-3 sentence summary of game progression",\n  "turningPoint": {\n    "snapshot": 3,\n    "gameTime": "12:30",\n    "team": "team name",\n    "confidence": 78,\n    "reason": "why this was the turning point"\n  },\n  "keyFactors": ["factor 1", "factor 2", "factor 3"],\n  "prediction": {\n    "team": "predicted winner",\n    "confidence": 82,\n    "summary": "1 sentence final assessment"\n  }\n}`;
    try {
      return res.status(200).json(await callGemini(key, { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } }));
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── stats (screenshot → scoreboard) ─────────────────────────────────────────
  if (action === 'stats') {
    if (req.method !== 'POST') return res.status(405).end();
    const { base64, mimeType } = req.body;
    if (!base64 || !mimeType) return res.status(400).json({ error: 'Missing base64 or mimeType' });
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    const prompt = `Analyze this League of Legends broadcast screenshot. Extract the scoreboard information from the HUD at the top of the screen:\n- Blue team name and Red team name\n- Gold for Blue team and Red team (shown as numbers like 55.2k)\n- Kills for Blue team and Red team (shown as numbers either side of the centre)\n- Towers destroyed for Blue team and Red team (tower icon with a number)\n- Dragons taken by Blue team and Red team — IMPORTANT: dragons are shown as small coloured elemental icons (fire, water, earth, wind, void, chemtech, hextech) NOT as a plain number. Count how many dragon icons appear on each side of the scoreboard and return that count as an integer.\n- Current game time (MM:SS shown in the centre top area)\n\nReturn ONLY clean JSON in this exact format with no extra text:\n{\n  "blueTeam": "team name or empty string",\n  "redTeam": "team name or empty string",\n  "gameTime": "MM:SS or empty string",\n  "blue": { "gold": 0, "kills": 0, "towers": 0, "dragons": 0 },\n  "red": { "gold": 0, "kills": 0, "towers": 0, "dragons": 0 }\n}\n\nIf no active LoL game scoreboard is visible, return: { "error": "no scoreboard visible" }`;
    try {
      return res.status(200).json(await callGemini(key, { contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: prompt }] }], generationConfig: { temperature: 0.1 } }));
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // ── save ─────────────────────────────────────────────────────────────────────
  if (action === 'save') {
    if (req.method !== 'POST') return res.status(405).end();
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return res.status(500).json({ error: 'Supabase not configured' });
    const supabase = createClient(url, key);
    const { league, blueTeam, redTeam, snapshots, aiAnalysis, modelProbBlue, polymarketOdds } = req.body;
    if (!snapshots?.length) return res.status(400).json({ error: 'No snapshots' });
    const last = snapshots[snapshots.length - 1], first = snapshots[0];
    const row = {
      league: league ?? null, blue_team: blueTeam ?? null, red_team: redTeam ?? null,
      snapshot_count: snapshots.length, game_time_final: last.gameTime ?? null,
      final_gold_diff:   last.blue.gold    - last.red.gold,
      final_kill_diff:   last.blue.kills   - last.red.kills,
      final_tower_diff:  last.blue.towers  - last.red.towers,
      final_dragon_diff: last.blue.dragons - last.red.dragons,
      snapshots, ai_narrative: aiAnalysis?.narrative ?? null,
      ai_turning_point: aiAnalysis?.turningPoint ?? null,
      ai_key_factors: aiAnalysis?.keyFactors ?? null,
      ai_predicted_winner: aiAnalysis?.prediction?.team ?? null,
      ai_confidence: aiAnalysis?.prediction?.confidence ?? null,
      model_prob_blue: modelProbBlue ?? null, polymarket_odds: polymarketOdds ?? null,
    };
    const { data, error } = await supabase.from('esports_games').insert(row).select('id').single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ id: data.id });
  }

  // ── scan (champion/player names from screenshot) ──────────────────────────
  if (action === 'scan') {
    if (req.method !== 'POST') return res.status(405).end();
    const { base64, mimeType } = req.body;
    if (!base64 || !mimeType) return res.status(400).json({ error: 'Missing base64 or mimeType' });
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    const prompt = `This is a League of Legends esports broadcast screenshot.\nExtract the following for both Blue and Red team:\n- Player name (in-game name)\n- Champion name (exact spelling)\n- Role if visible (Top, Jungle, Mid, ADC, Support)\n\nReturn ONLY clean JSON:\n{\n  "blue": [{"player": "...", "champion": "..."}, ...],\n  "red": [{"player": "...", "champion": "..."}, ...]\n}`;
    try {
      return res.status(200).json(await callGemini(key, { contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: prompt }] }], generationConfig: { temperature: 0.1 } }));
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: 'Missing or unknown action. Use ?action=schedule|markets|analysis|stats|save|scan' });
}
