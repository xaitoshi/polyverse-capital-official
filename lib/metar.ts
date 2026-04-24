// Historical METAR from Iowa State's Mesonet ASOS archive. This is the same
// data Polymarket temperature markets resolve against (Wunderground pulls from
// the same station reports), so using it keeps the "actual" line honest.

export type HistoryDay = {
  date: string; // YYYY-MM-DD
  highC: number | null;
  lowC: number | null;
};

const fToC = (f: number) => ((f - 32) * 5) / 9;

export async function fetchAsosDaily(
  station: string,
  startISO: string,
  endISO: string
): Promise<HistoryDay[]> {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const params = new URLSearchParams({
    station,
    data: "tmpf",
    tz: "UTC",
    format: "onlycomma",
    latlon: "no",
    missing: "empty",
    trace: "empty",
    direct: "no",
    report_type: "3",
    year1: String(start.getUTCFullYear()),
    month1: String(start.getUTCMonth() + 1),
    day1: String(start.getUTCDate()),
    year2: String(end.getUTCFullYear()),
    month2: String(end.getUTCMonth() + 1),
    day2: String(end.getUTCDate()),
  });

  const url = `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?${params}`;
  // Iowa Mesonet rate-limits hard and frequently returns only the header
  // row when our server is firing several requests in parallel (forecast,
  // history and similar-days all compete on the same panel open). Retry a
  // few times with backoff before giving up. Also `no-store` because multi-
  // year windows exceed Next's 2MB fetch cache limit.
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let text = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await sleep(400 * attempt);
    const res = await fetch(url, {
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Weatherverse/0.1; +https://weatherverse.local)",
        Accept: "text/csv,text/plain,*/*",
      },
    });
    if (!res.ok) continue;
    text = await res.text();
    // Mesonet returns just the `station,valid,tmpf` header line when
    // back-pressured; anything beyond ~40 bytes means we got real rows.
    if (text.length > 40) break;
  }
  if (!text || text.length <= 40) return [];

  const lines = text.split("\n").slice(1);
  const byDay = new Map<string, { highF: number; lowF: number }>();
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(",");
    const ts = parts[1];
    const tmpf = Number(parts[2]);
    if (!ts || !Number.isFinite(tmpf)) continue;
    const date = ts.slice(0, 10);
    const prev = byDay.get(date);
    if (!prev) byDay.set(date, { highF: tmpf, lowF: tmpf });
    else {
      if (tmpf > prev.highF) prev.highF = tmpf;
      if (tmpf < prev.lowF) prev.lowF = tmpf;
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { highF, lowF }]) => ({
      date,
      highC: Math.round(fToC(highF) * 10) / 10,
      lowC: Math.round(fToC(lowF) * 10) / 10,
    }));
}

export type SameDayRecord = {
  year: number;
  date: string;
  highC: number | null;
  lowC: number | null;
};

// Pull the same calendar day across the last N years at one station. The
// Iowa ASOS archive can be patchy for individual days, so we widen to a
// ±1-day window and pick the row that matches the exact target date.
export async function fetchSameDayAcrossYears(
  station: string,
  month: number,
  day: number,
  years: number[]
): Promise<SameDayRecord[]> {
  // Iowa Mesonet rate-limits aggressively when you fire several fast
  // requests back-to-back — the losers return empty CSV even though the
  // data exists. Serialize, and space each request ~350ms apart so we
  // stay under whatever their burst threshold is. Total ≈ 1.5-2s for
  // five years, once per 24h per route cache.
  const results: SameDayRecord[] = [];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < years.length; i++) {
    const year = years[i];
    if (i > 0) await sleep(800);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const target = `${year}-${String(month).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
    let hit = null as Awaited<ReturnType<typeof fetchAsosDaily>>[number] | null;
    // Mesonet silently returns empty windows under rate-limit back-pressure.
    // Retry with growing windows and pauses until we find the target day or
    // exhaust our budget.
    for (const widen of [0, 1, 3] as const) {
      const s = new Date(Date.UTC(year, month - 1, day - 2 - widen));
      const e = new Date(Date.UTC(year, month - 1, day + 2 + widen));
      try {
        const days = await fetchAsosDaily(station, iso(s), iso(e));
        const found = days.find((d) => d.date === target);
        if (found) {
          hit = found;
          break;
        }
      } catch {
        /* retry via widen */
      }
      await sleep(700);
    }
    results.push({
      year,
      date: target,
      highC: hit?.highC ?? null,
      lowC: hit?.lowC ?? null,
    });
  }
  return results.sort((a, b) => b.year - a.year);
}
