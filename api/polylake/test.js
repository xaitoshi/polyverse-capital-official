export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  const result = {
    supabase_url: url ? `${url.slice(0, 30)}...` : 'MISSING',
    supabase_key: key ? `${key.slice(0, 10)}...` : 'MISSING',
    configured: !!(url && key),
  };

  if (!url || !key) {
    return res.status(500).json({ ...result, error: 'Supabase env vars missing' });
  }

  // Try a simple query against the wallets table
  try {
    const r = await fetch(`${url}/rest/v1/wallets?limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }

    return res.status(200).json({
      ...result,
      supabase_status: r.status,
      supabase_response: body,
      table_exists: r.ok,
    });
  } catch (e) {
    return res.status(500).json({ ...result, error: e.message });
  }
}
