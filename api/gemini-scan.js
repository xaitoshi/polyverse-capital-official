export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { base64, mimeType } = req.body;
  if (!base64 || !mimeType) return res.status(400).json({ error: 'Missing base64 or mimeType' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const prompt = `This is a League of Legends esports broadcast screenshot.
Extract the following for both Blue and Red team:
- Player name (in-game name)
- Champion name (exact spelling)
- Role if visible (Top, Jungle, Mid, ADC, Support)

Return ONLY clean JSON:
{
  "blue": [{"player": "...", "champion": "..."}, ...],
  "red": [{"player": "...", "champion": "..."}, ...]
}`;

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
