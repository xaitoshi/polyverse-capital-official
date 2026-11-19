/**
 * Cron jobs. Markets come from Polymarket. Elo and rank come from the
 * committed reference snapshot (Tennis Abstract blocks a lot of serverless IPs).
 * Picks insert once, and only while start_time is still in the future.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildRecord, gradePick, resolutionFromPrices, summarize } from "../../lib/tennis/grade.ts";
import { INPUTS_VERSION } from "../../lib/tennis/methodology.ts";
import { draftPick } from "../../lib/tennis/model.ts";
import { compactName, namesMatch, playerId } from "../../lib/tennis/names.ts";
import { countryName, toIso2 } from "../../lib/tennis/countries.ts";
import {
  classifyEvent,
  countryFromFlagUrl,
  eventTour,
  itfLevel,
  moneyline,
  outcomeMids,
  parseSets,
  serverSide,
  setsWon,
  tournamentFromTitle,
  volumeOf,
  type RawEvent,
} from "../../lib/tennis/parse.ts";
import type { BoardView, LockedPick, MatchView, PlayerSummary, RecordView, SettledResult, Tier, Tour } from "../../lib/tennis/types.ts";
import { ensureSchema, getDb, type Db } from "./store.ts";

interface EloRef {
  name: string;
  slug: string;
  tour: Tour;
  elo: number;
  hElo: number | null;
  cElo: number | null;
  gElo: number | null;
  updated: string | null;
}
interface RankRef {
  tour: "atp" | "wta";
  rank: number;
  name: string;
  countryCode: string | null;
  countryName: string | null;
  flagUrl: string | null;
  asOf: string | null;
}
interface TourRef { city: string; tier: Tier; level: string | null }
interface Reference {
  generatedAt?: string;
  elo?: EloRef[];
  rankings?: RankRef[];
  tours?: TourRef[];
}

async function loadReference(): Promise<Reference | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), "public/data/tennis/reference.json"), "utf8");
    return JSON.parse(raw) as Reference;
  } catch {
    return null;
  }
}

async function fetchGamma(): Promise<RawEvent[]> {
  const series = ["10365", "10366", "11634"];
  const all: RawEvent[] = [];
  for (const id of series) {
    for (let offset = 0; offset <= 2000; offset += 100) {
      const url = `https://gamma-api.polymarket.com/events?series_id=${id}&closed=false&limit=100&offset=${offset}`;
      const res = await fetch(url, { headers: { Accept: "application/json", "Accept-Encoding": "gzip", "User-Agent": "PolyverseTennis/0.1" } });
      if (!res.ok) throw new Error(`gamma ${res.status}`);
      const batch = (await res.json()) as RawEvent[];
      if (!Array.isArray(batch) || !batch.length) break;
      all.push(...batch);
      if (batch.length < 100) break;
    }
  }
  return all;
}

function findName<T extends { name: string }>(rows: T[], name: string): T | null {
  const compact = compactName(name);
  const hit = rows.find((r) => compactName(r.name) === compact);
  if (hit) return hit;
  const loose = rows.filter((r) => namesMatch(r.name, name));
  return loose.length === 1 ? loose[0]! : null;
}

function tierFor(tour: Tour, tournament: string, title: string, files: TourRef[]): { tier: Tier; level: string | null } {
  if (tour === "itf") return { tier: "itf", level: itfLevel(title) };
  const blob = `${tournament} ${title}`.toLowerCase();
  if (blob.includes("challenger")) return { tier: "challenger", level: null };
  let best: TourRef | null = null;
  for (const f of files) {
    const city = f.city.toLowerCase();
    if (city.length >= 4 && blob.includes(city) && (!best || f.city.length > best.city.length)) best = f;
  }
  if (best) return { tier: best.tier, level: best.level };
  if (tour === "wta") return { tier: "wta", level: null };
  if (/finals/i.test(blob)) return { tier: "atp", level: "Finals" };
  return { tier: "atp", level: null };
}

function playerOf(name: string, logo: string | undefined, elo: EloRef | null, rank: RankRef | null): PlayerSummary {
  const countryCode = toIso2(rank?.countryCode || countryFromFlagUrl(logo));
  return {
    id: playerId(name),
    name,
    countryCode,
    countryName: rank?.countryName || countryName(countryCode),
    flagUrl: rank?.flagUrl || (countryCode && logo && !logo.includes("/un.png") ? logo : null),
    rank: rank?.rank ?? null,
    rankTour: rank ? (rank.tour === "wta" ? "WTA" : "ATP") : null,
    rankSource: rank ? `ESPN ${rank.tour.toUpperCase()} rankings${rank.asOf ? ` ${rank.asOf}` : ""}` : null,
    elo: elo?.elo ?? null,
    hElo: elo?.hElo ?? null,
    cElo: elo?.cElo ?? null,
    gElo: elo?.gElo ?? null,
    eloSource: elo ? `Tennis Abstract ${elo.tour.toUpperCase()} Elo${elo.updated ? `, updated ${elo.updated}` : ""}` : null,
    photo: null,
    form: null,
    serve: null,
    recentH2h: null,
    resultRating: null,
    resultRatingN: null,
    resultRatingSource: null,
  };
}

function toMatch(ev: RawEvent, now: number, ref: Reference | null): MatchView | null {
  const status = classifyEvent(ev, now);
  if (status === "ignore") return null;
  const tour = eventTour(ev);
  const ml = moneyline(ev);
  if (!tour || !ml || !ev.id || !ev.slug || !ev.startTime) return null;
  const mids = outcomeMids(ml);
  const teams = ev.teams ?? [];
  const nameA = teams.find((t) => t.ordering === "home")?.name || mids.names[0];
  const nameB = teams.find((t) => t.ordering === "away")?.name || mids.names[1];
  if (!nameA || !nameB) return null;
  const priceFor = (name: string) => {
    const idx = mids.names.findIndex((n) => namesMatch(n, name));
    return idx >= 0 ? mids.prices[idx] ?? null : null;
  };
  const { tournament } = tournamentFromTitle(ev.title || "");
  const tier = tierFor(tour, tournament, ev.title || "", ref?.tours ?? []);
  const eloA = findName(ref?.elo ?? [], nameA);
  const eloB = findName(ref?.elo ?? [], nameB);
  const rankA = findName(ref?.rankings ?? [], nameA);
  const rankB = findName(ref?.rankings ?? [], nameB);
  const sets = parseSets(ev.score);
  const won = setsWon(sets, status);
  const marketClosed = Boolean(ml.closed || ev.closed);
  return {
    id: String(ev.id),
    slug: ev.slug,
    title: ev.title || `${nameA} vs ${nameB}`,
    tour,
    tier: tier.tier,
    level: tier.level,
    tournament,
    round: null,
    surface: null,
    surfaceSource: null,
    startTime: ev.startTime,
    period: ev.period ?? null,
    scoreRaw: ev.score ?? null,
    sets,
    setsWonA: won.a,
    setsWonB: won.b,
    server: serverSide(ev, nameA, nameB),
    status,
    playerA: playerOf(nameA, teams.find((t) => t.name && namesMatch(t.name, nameA))?.logo, eloA, rankA),
    playerB: playerOf(nameB, teams.find((t) => t.name && namesMatch(t.name, nameB))?.logo, eloB, rankB),
    priceA: priceFor(nameA),
    priceB: priceFor(nameB),
    volume: volumeOf(ml),
    marketClosed,
    polymarketUrl: `https://polymarket.com/event/${ev.slug}`,
    pick: null,
    result: null,
  };
}

async function upsertMatch(db: Db, match: MatchView): Promise<void> {
  await db.query(
    `INSERT INTO tennis_matches (id, start_time, status, payload, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, payload = EXCLUDED.payload, start_time = EXCLUDED.start_time, updated_at = now()`,
    [match.id, match.startTime, match.status, JSON.stringify({ ...match, pick: null, result: null })],
  );
}

async function insertPickIfEligible(db: Db, match: MatchView, now: number): Promise<LockedPick | null> {
  const existing = await db.query(`SELECT payload FROM tennis_picks WHERE match_id = $1`, [match.id]);
  if (existing.rows[0]?.payload) return existing.rows[0].payload as unknown as LockedPick;
  if (Date.parse(match.startTime) <= now) return null;
  const pick = draftPick({
    nowMs: now,
    startMs: Date.parse(match.startTime),
    surface: match.surface,
    playerA: { elo: match.playerA.elo, hElo: match.playerA.hElo, cElo: match.playerA.cElo, gElo: match.playerA.gElo, rank: match.playerA.rank },
    playerB: { elo: match.playerB.elo, hElo: match.playerB.hElo, cElo: match.playerB.cElo, gElo: match.playerB.gElo, rank: match.playerB.rank },
    priceA: match.priceA,
    priceB: match.priceB,
    playerAId: match.playerA.id,
    playerBId: match.playerB.id,
    playerAName: match.playerA.name,
    playerBName: match.playerB.name,
  });
  if (!pick) return null;
  const inserted = await db.query(
    `INSERT INTO tennis_picks (match_id, picked_at, payload)
     SELECT m.id, $2, $3::jsonb FROM tennis_matches m
     WHERE m.id = $1 AND m.start_time > now()
     ON CONFLICT (match_id) DO NOTHING
     RETURNING payload`,
    [match.id, pick.pickedAt, JSON.stringify(pick)],
  );
  if (inserted.rows[0]?.payload) return inserted.rows[0].payload as unknown as LockedPick;
  const again = await db.query(`SELECT payload FROM tennis_picks WHERE match_id = $1`, [match.id]);
  return (again.rows[0]?.payload as unknown as LockedPick) ?? null;
}

async function settle(db: Db, match: MatchView, pick: LockedPick | null, nowIso: string): Promise<SettledResult | null> {
  const have = await db.query(`SELECT payload FROM tennis_results WHERE match_id = $1`, [match.id]);
  if (have.rows[0]?.payload) return have.rows[0].payload as unknown as SettledResult;
  if (!pick) return null;
  const resolution = resolutionFromPrices(match.priceA, match.priceB, match.marketClosed, "polymarket moneyline");
  const graded = gradePick(pick, resolution, nowIso);
  if (!graded) return null;
  await db.query(
    `INSERT INTO tennis_results (match_id, settled_at, payload)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (match_id) DO NOTHING`,
    [match.id, graded.settledAt, JSON.stringify(graded)],
  );
  return graded;
}

export async function runJob(job: "ingest" | "picks" | "settle" | "all"): Promise<Record<string, unknown>> {
  const db = await getDb();
  if (!db) return { ok: false, skipped: true, reason: "DATABASE_URL is not set" };
  await ensureSchema(db);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const ref = await loadReference();
  const doIngest = job === "ingest" || job === "all" || job === "picks" || job === "settle";
  if (!doIngest) return { ok: false, error: "unknown job" };

  const events = await fetchGamma();
  let upserts = 0;
  let picksWritten = 0;
  let settled = 0;
  for (const ev of events) {
    const match = toMatch(ev, now, ref);
    if (!match) continue;
    if (job === "ingest" || job === "all" || job === "picks" || job === "settle") {
      await upsertMatch(db, match);
      upserts += 1;
    }
    let pick: LockedPick | null = null;
    if (job === "picks" || job === "all" || job === "settle") {
      const before = await db.query(`SELECT payload FROM tennis_picks WHERE match_id = $1`, [match.id]);
      pick = before.rows[0]?.payload ? (before.rows[0].payload as unknown as LockedPick) : null;
      if (!pick && (job === "picks" || job === "all")) {
        const inserted = await insertPickIfEligible(db, match, now);
        if (inserted && !before.rows.length) picksWritten += 1;
        pick = inserted;
      }
    }
    if ((job === "settle" || job === "all") && pick) {
      const had = await db.query(`SELECT 1 FROM tennis_results WHERE match_id = $1`, [match.id]);
      const result = await settle(db, match, pick, nowIso);
      if (result && !had.rows.length) settled += 1;
    }
  }
  return {
    ok: true,
    job,
    upserts,
    picksWritten,
    settled,
    inputsVersion: INPUTS_VERSION,
    referenceAt: ref?.generatedAt ?? null,
    note: "Serve and recent-form adjustments are applied on the snapshot build. Cron picks use Elo and rank from reference.json and do not rewrite an existing pick.",
  };
}

export async function readBoard(db: Db): Promise<BoardView> {
  await ensureSchema(db);
  const matches = await hydrate(db);
  return {
    generatedAt: new Date().toISOString(),
    inputsVersion: INPUTS_VERSION,
    source: "postgres",
    matches,
    record: summarize(matches),
    sources: { markets: "polymarket gamma", storage: "DATABASE_URL" },
    notes: [
      "Live board from Postgres. Picks are the rows written before start and are not recomputed.",
      "Photos and serve samples are on the static snapshot. This view leaves them blank when the database row does not carry them.",
    ],
  };
}

export async function readRecord(db: Db): Promise<RecordView & { source: "postgres" }> {
  await ensureSchema(db);
  const matches = await hydrate(db);
  return { ...buildRecord(matches, new Date().toISOString(), INPUTS_VERSION), source: "postgres" };
}

async function hydrate(db: Db): Promise<MatchView[]> {
  const res = await db.query(
    `SELECT m.payload AS match, p.payload AS pick, r.payload AS result
     FROM tennis_matches m
     LEFT JOIN tennis_picks p ON p.match_id = m.id
     LEFT JOIN tennis_results r ON r.match_id = m.id
     ORDER BY m.start_time ASC`,
  );
  return res.rows.map((row) => {
    const match = row.match as unknown as MatchView;
    match.pick = (row.pick as unknown as LockedPick) ?? null;
    match.result = (row.result as unknown as SettledResult) ?? null;
    return match;
  });
}

export async function readPlayer(db: Db, id: string): Promise<{ source: "postgres"; player: PlayerSummary; recent: []; picks: ReturnType<typeof buildRecord>["pending"]; generatedAt: string } | null> {
  const matches = await hydrate(db);
  const hits = matches.filter((m) => m.playerA.id === id || m.playerB.id === id);
  if (!hits.length) return null;
  const player = hits[0]!.playerA.id === id ? hits[0]!.playerA : hits[0]!.playerB;
  const record = buildRecord(hits, new Date().toISOString(), INPUTS_VERSION);
  return {
    source: "postgres",
    player,
    recent: [],
    picks: [...record.pending, ...record.settled],
    generatedAt: new Date().toISOString(),
  };
}
