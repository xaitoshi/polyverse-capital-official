export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { base64, mimeType } = req.body;
  if (!base64 || !mimeType) return res.status(400).json({ error: 'Missing base64 or mimeType' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const prompt = `You are analyzing a League of Legends esports champion pick/ban phase screenshot.
Extract the following and respond ONLY with valid JSON (no markdown, no explanation):
{
  "teamA": {
    "name": "team name or empty string",
    "players": [
      {"name": "player name or empty string", "champion": "exact champion name as in the game", "position": "Top"},
      {"name": "", "champion": "", "position": "Jungle"},
      {"name": "", "champion": "", "position": "Mid"},
      {"name": "", "champion": "", "position": "Bot"},
      {"name": "", "champion": "", "position": "Support"}
    ]
  },
  "teamB": {
    "name": "team name or empty string",
    "players": [
      {"name": "", "champion": "", "position": "Top"},
      {"name": "", "champion": "", "position": "Jungle"},
      {"name": "", "champion": "", "position": "Mid"},
      {"name": "", "champion": "", "position": "Bot"},
      {"name": "", "champion": "", "position": "Support"}
    ]
  }
}
Always return all 5 players for each team. Use empty strings for anything not visible. Champion names must be exact game names (e.g. "K'Sante", "Bel'Veth", "Aurelion Sol").`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: prompt }] }],
          generationConfig: { temperature: 0.1 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const text = await geminiRes.text();
      return res.status(502).json({ error: `Gemini error ${geminiRes.status}: ${text}` });
    }

    const data = await geminiRes.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e.message ?? 'Unknown error' });
  }
}
