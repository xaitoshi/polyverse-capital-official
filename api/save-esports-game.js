import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Supabase not configured' });

  const supabase = createClient(url, key);

  const {
    league, blueTeam, redTeam, snapshots,
    aiAnalysis, modelProbBlue, polymarketOdds,
  } = req.body;

  if (!snapshots?.length) return res.status(400).json({ error: 'No snapshots' });

  const last = snapshots[snapshots.length - 1];
  const first = snapshots[0];

  const row = {
    league:              league ?? null,
    blue_team:           blueTeam ?? null,
    red_team:            redTeam  ?? null,
    snapshot_count:      snapshots.length,
    game_time_final:     last.gameTime ?? null,
    final_gold_diff:     last.blue.gold    - last.red.gold,
    final_kill_diff:     last.blue.kills   - last.red.kills,
    final_tower_diff:    last.blue.towers  - last.red.towers,
    final_dragon_diff:   last.blue.dragons - last.red.dragons,
    snapshots:           snapshots,
    ai_narrative:        aiAnalysis?.narrative        ?? null,
    ai_turning_point:    aiAnalysis?.turningPoint     ?? null,
    ai_key_factors:      aiAnalysis?.keyFactors       ?? null,
    ai_predicted_winner: aiAnalysis?.prediction?.team ?? null,
    ai_confidence:       aiAnalysis?.prediction?.confidence ?? null,
    model_prob_blue:     modelProbBlue ?? null,
    polymarket_odds:     polymarketOdds ?? null,
  };

  const { data, error } = await supabase.from('esports_games').insert(row).select('id').single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ id: data.id });
}
