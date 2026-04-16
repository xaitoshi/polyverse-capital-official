export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { base64, mimeType } = req.body;
  if (!base64 || !mimeType) return res.status(400).json({ error: 'Missing base64 or mimeType' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const prompt = `Analyze this League of Legends broadcast screenshot. Extract the scoreboard information from the HUD at the top of the screen:
- Blue team name and Red team name
- Gold for Blue team and Red team (shown as numbers like 55.2k)
- Kills for Blue team and Red team (shown as numbers either side of the centre)
- Towers destroyed for Blue team and Red team (tower icon with a number)
- Dragons taken by Blue team and Red team — IMPORTANT: dragons are shown as small coloured elemental icons (fire, water, earth, wind, void, chemtech, hextech) NOT as a plain number. Count how many dragon icons appear on each side of the scoreboard and return that count as an integer.
- Current game time (MM:SS shown in the centre top area)

Return ONLY clean JSON in this exact format with no extra text:
{
  "blueTeam": "team name or empty string",
  "redTeam": "team name or empty string",
  "gameTime": "MM:SS or empty string",
  "blue": { "gold": 0, "kills": 0, "towers": 0, "dragons": 0 },
  "red": { "gold": 0, "kills": 0, "towers": 0, "dragons": 0 }
}

If no active LoL game scoreboard is visible, return: { "error": "no scoreboard visible" }`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: prompt },
          ]}],
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
