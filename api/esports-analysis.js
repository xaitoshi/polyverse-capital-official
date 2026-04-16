// Gemini-powered analysis of collected in-game stats snapshots
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { blueTeam, redTeam, history, polyOdds, modelProb } = req.body;
  if (!history?.length) return res.status(400).json({ error: 'No history provided' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  // Format history into a readable table for Gemini
  const startTime = history[0].timestamp;
  const rows = history.map((s, i) => {
    const elapsed = Math.round((s.timestamp - startTime) / 1000);
    const goldDiff  = s.blue.gold    - s.red.gold;
    const killDiff  = s.blue.kills   - s.red.kills;
    const towerDiff = s.blue.towers  - s.red.towers;
    const dragDiff  = s.blue.dragons - s.red.dragons;
    return `Snap ${i + 1} (${s.gameTime ?? `+${elapsed}s`}): gold ${goldDiff > 0 ? '+' : ''}${goldDiff}, kills ${killDiff > 0 ? '+' : ''}${killDiff}, towers ${towerDiff > 0 ? '+' : ''}${towerDiff}, dragons ${dragDiff > 0 ? '+' : ''}${dragDiff} — Blue: ${JSON.stringify(s.blue)} | Red: ${JSON.stringify(s.red)}`;
  }).join('\n');

  const polyLine = polyOdds?.length
    ? `\nPolymarket live odds: ${polyOdds.map(m => `"${m.question}" → ${m.prices}`).join('; ')}`
    : '';
  const modelLine = modelProb
    ? `\nModel win prediction (historical stats): ${blueTeam} ${Math.round(modelProb * 100)}% vs ${redTeam} ${Math.round((1 - modelProb) * 100)}%`
    : '';

  const prompt = `You are an expert League of Legends esports analyst. You have been given a series of in-game stat snapshots captured every ~15 seconds from a live broadcast.

Teams: ${blueTeam || 'Blue'} (blue side) vs ${redTeam || 'Red'} (red side)
${modelLine}${polyLine}

Snapshot data (all diffs are Blue minus Red):
${rows}

Please provide:
1. A concise narrative of how the game progressed based on the data
2. The exact snapshot number and game time where you first had HIGH CONFIDENCE (>70%) about which team would likely win, and why that snapshot was the turning point
3. What the key deciding factors were (gold lead, objective control, kill differential etc.)
4. Your final prediction of the likely winner with a confidence %

Return ONLY clean JSON in this exact format with no extra text:
{
  "narrative": "2-3 sentence summary of game progression",
  "turningPoint": {
    "snapshot": 3,
    "gameTime": "12:30",
    "team": "team name",
    "confidence": 78,
    "reason": "why this was the turning point"
  },
  "keyFactors": ["factor 1", "factor 2", "factor 3"],
  "prediction": {
    "team": "predicted winner",
    "confidence": 82,
    "summary": "1 sentence final assessment"
  }
}`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2 },
        }),
      }
    );
    if (!r.ok) {
      const t = await r.text();
      return res.status(502).json({ error: `Gemini ${r.status}: ${t}` });
    }
    const data = await r.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const clean = text.replace(/```json|```/g, '').trim();
    return res.status(200).json(JSON.parse(clean));
  } catch (e) {
    return res.status(500).json({ error: e.message ?? 'Unknown error' });
  }
}
