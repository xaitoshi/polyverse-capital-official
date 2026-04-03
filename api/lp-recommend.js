export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { market } = req.body;
  if (!market) return res.status(400).json({ error: 'Missing market data' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const dailyRate = (market.rewards_config ?? []).reduce((s, r) => s + (r.rate_per_day ?? 0), 0);
  const yesPrice = market.tokens?.find(t => t.outcome === 'Yes')?.price ?? null;
  const noPrice = market.tokens?.find(t => t.outcome === 'No')?.price ?? null;
  const maxSpreadPct = market.rewards_max_spread ?? 0;
  const minSize = market.rewards_min_size ?? 0;
  const competition = market.market_competitiveness ?? 0;
  const daysLeft = market.daysUntilResolution ?? 0;

  const prompt = `You are an expert Polymarket liquidity provider. A user wants to earn LP rewards on this market.

Market: "${market.question}"
Current YES price: ${yesPrice != null ? (yesPrice * 100).toFixed(1) + '¢' : 'unknown'}
Current NO price: ${noPrice != null ? (noPrice * 100).toFixed(1) + '¢' : 'unknown'}
Current spread: ${market.spread != null ? (market.spread * 100).toFixed(2) + '%' : 'unknown'}
Max allowed spread to qualify for rewards: ${maxSpreadPct}%
Min order size to qualify: $${minSize}
Daily reward pool: $${dailyRate}/day
Days until resolution: ${daysLeft.toFixed(1)}
Competition (capital already scoring): $${competition.toLocaleString()}

Provide a concise LP recommendation with:
1. YES bid price (in cents, e.g. "47.5¢") — where to place the YES limit buy to stay inside the qualifying spread with a small safety buffer
2. NO bid price (in cents) — where to place the NO limit buy
3. Recommended order size — a practical starting amount in USD
4. One-line rationale per recommendation (max 15 words each)

Reply ONLY with valid JSON in this exact shape (no markdown, no extra text):
{
  "yes_bid": "XX.X¢",
  "no_bid": "XX.X¢",
  "order_size": "$XXX",
  "yes_rationale": "...",
  "no_rationale": "...",
  "size_rationale": "...",
  "summary": "One sentence overall strategy (max 25 words)"
}`;

  try {
    const geminiRes = await fetch(
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

    if (!geminiRes.ok) {
      const text = await geminiRes.text();
      return res.status(502).json({ error: `Gemini error ${geminiRes.status}: ${text}` });
    }

    const data = await geminiRes.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e.message ?? 'Unknown error' });
  }
}
