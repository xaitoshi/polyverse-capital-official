/**
 * Build the public tennis snapshot from free sources.
 * Picks already stored in public/data/tennis/board.json are kept verbatim.
 * Matches that have already started never receive a new pick.
 *
 * Cache: data/tennis-cache/ (gitignored). Be polite to Tennis Abstract and Wikimedia.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isBoardMatch } from "../../src/lib/tennis/boardFilter.ts";
import { countryName, toIso2 } from "../../src/lib/tennis/countries.ts";
import { coverageReport } from "../../src/lib/tennis/coverage.ts";
import { buildRecord, gradePick, resolutionFromPrices, summarize } from "../../src/lib/tennis/grade.ts";
import { INPUTS_VERSION, METHODOLOGY_SECTIONS } from "../../src/lib/tennis/methodology.ts";
import { draftPick, eloWinProb, rankPrior, type SideInput } from "../../src/lib/tennis/model.ts";
import { compactName, foldName, namesMatch, playerId, taSlugCandidates } from "../../src/lib/tennis/names.ts";
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
  surfaceFromText,
  tournamentFromTitle,
  volumeOf,
  type RawEvent,
} from "../../src/lib/tennis/parse.ts";
import type {
  BoardView,
  Coverage,
  LockedPick,
  MatchView,
  PhotoCredit,
  PlayerContext,
  PlayerProfile,
  PlayerSummary,
  RecentRow,
  ServeLine,
  Surface,
  Tier,
  Tour,
} from "../../src/lib/tennis/types.ts";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OUT = path.join(ROOT, "public/data/tennis");
const CACHE = path.join(ROOT, "data/tennis-cache");
const UA = "PolyverseTennis/0.1 (+https://polyverse.capital; research snapshot; contact via site)";

const SERIES: { id: string; tour: Tour }[] = [
  { id: "10365", tour: "atp" },
  { id: "10366", tour: "wta" },
  { id: "11634", tour: "itf" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tennis Abstract sits behind Cloudflare, which challenges Node/undici. Python urllib is accepted. */
function fetchViaPython(url: string): Promise<Buffer> {
  const code = `
import gzip, sys, urllib.request
url = sys.argv[1]
req = urllib.request.Request(url, headers={
  "User-Agent": "Mozilla/5.0 (compatible; PolyverseTennis/0.1; +https://polyverse.capital)",
  "Accept": "text/html,application/json,*/*",
  "Accept-Encoding": "gzip",
})
with urllib.request.urlopen(req, timeout=60) as r:
    raw = r.read()
if raw[:2] == b"\\x1f\\x8b":
    raw = gzip.decompress(raw)
sys.stdout.buffer.write(raw)
`;
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["-c", code, url]);
    const chunks: Buffer[] = [];
    let err = "";
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", (c: Buffer) => {
      err += c.toString();
    });
    child.on("close", (status) => {
      if (status !== 0) reject(new Error(err.trim() || `python fetch ${status} ${url}`));
      else resolve(Buffer.concat(chunks));
    });
  });
}

async function fetchBuf(url: string, headers: Record<string, string> = {}): Promise<{ status: number; buf: Buffer; type: string }> {
  if (url.includes("tennisabstract.com")) {
    const buf = await fetchViaPython(url);
    return { status: 200, buf, type: "text/html" };
  }
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Encoding": "gzip", Accept: "application/json,text/html,*/*", ...headers },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, type: res.headers.get("content-type") || "" };
}

async function fetchText(url: string): Promise<string> {
  const { status, buf } = await fetchBuf(url);
  if (status >= 400) throw new Error(`${status} ${url}`);
  return buf.toString("utf8");
}

async function fetchJson<T>(url: string): Promise<T> {
  const { status, buf } = await fetchBuf(url);
  if (status >= 400) throw new Error(`${status} ${url}`);
  return JSON.parse(buf.toString("utf8")) as T;
}

async function cached(file: string, maxAgeMs: number, loader: () => Promise<string>): Promise<string> {
  await mkdir(path.dirname(file), { recursive: true });
  try {
    const stat = await import("node:fs/promises").then((fs) => fs.stat(file));
    if (Date.now() - stat.mtimeMs < maxAgeMs) return await readFile(file, "utf8");
  } catch {
    /* miss */
  }
  const text = await loader();
  await writeFile(file, text);
  return text;
}

interface EloRow {
  tour: Tour;
  name: string;
  slug: string;
  elo: number;
  hElo: number | null;
  cElo: number | null;
  gElo: number | null;
  updated: string | null;
}

interface RankRow {
  tour: "atp" | "wta";
  rank: number;
  name: string;
  countryCode: string | null;
  countryName: string | null;
  flagUrl: string | null;
  headshotUrl: string | null;
  asOf: string | null;
}

interface FragRow {
  date: string;
  isoDate: string | null;
  tournament: string;
  surface: Surface | null;
  round: string | null;
  rank: number | null;
  oppRank: number | null;
  opponent: string;
  opponentCountry: string | null;
  result: "W" | "L" | "unplayed";
  score: string | null;
  acePct: number | null;
  dfPct: number | null;
  firstInPct: number | null;
  firstWonPct: number | null;
  secondWonPct: number | null;
  bpSavedPct: number | null;
}

function num(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(String(s).replace("%", "").trim());
  return Number.isFinite(n) ? n : null;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseElo(html: string, tour: "atp" | "wta"): { updated: string | null; rows: EloRow[] } {
  const updated = html.match(/Last update:\s*(\d{4}-\d{2}-\d{2})/i)?.[1] ?? null;
  const rows: EloRow[] = [];
  const re = /<tr><td align="right">\d+<\/td><td><a href="[^"]*player\.cgi\?p=([^"]+)">([^<]+)<\/a><\/td><td[^>]*>([^<]*)<\/td><td[^>]*>([^<]+)<\/td><td[^>]*><\/td><td[^>]*>([^<]*)<\/td><td[^>]*>([^<]*)<\/td><td[^>]*>([^<]*)<\/td><td[^>]*>([^<]*)<\/td><td[^>]*>([^<]*)<\/td><td[^>]*>([^<]*)<\/td>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const elo = num(m[4]);
    if (elo == null) continue;
    rows.push({
      tour,
      slug: m[1]!,
      name: stripTags(m[2]!).replace(/\u00a0/g, " "),
      elo,
      hElo: num(m[6]),
      cElo: num(m[8]),
      gElo: num(m[10]),
      updated,
    });
  }
  return { updated, rows };
}

function parseDate(raw: string): string | null {
  const m = raw.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (!m) return null;
  const months: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const mo = months[m[2]!.toLowerCase()];
  if (!mo) return null;
  return `${m[3]}-${mo}-${m[1]!.padStart(2, "0")}`;
}

function parseFrag(js: string): FragRow[] {
  const rows: FragRow[] = [];
  const re = /<tr>(?:<td[^>]*>.*?<\/td>){6,}<\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(js))) {
    const tds = [...m[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1] ?? "");
    if (tds.length < 8) continue;
    const matchCell = tds[6] ?? "";
    const text = stripTags(matchCell);
    if (!text) continue;
    const bPos = matchCell.indexOf("<b>");
    const dPos = matchCell.indexOf(" d. ");
    let result: FragRow["result"] = "unplayed";
    if (dPos !== -1 && bPos !== -1) result = dPos < bPos ? "L" : "W";
    else if (/\bvs\b/i.test(text)) result = "unplayed";
    const oppCountry = text.match(/\[([A-Z]{3})\]/)?.[1]?.toLowerCase() ?? null;
    const withoutCodes = text.replace(/\[[A-Z]{3}\]/g, " ").replace(/\(\d+\)|\([A-Z]{1,3}\)/g, " ");
    let opponent = withoutCodes;
    if (result === "W") opponent = withoutCodes.split(/\bd\.\s*/i)[1] || "";
    else if (result === "L") opponent = withoutCodes.split(/\bd\.\s*/i)[0] || "";
    else opponent = withoutCodes.split(/\bvs\b/i).find((p) => !/<b>/.test(p) && p.trim()) || withoutCodes;
    opponent = opponent.replace(/\s+/g, " ").trim();
    // The bold player is "us"; opponent is the other name. The split above is rough
    // because tags were already stripped in `withoutCodes`. Re-derive from stripped text.
    const plain = text.replace(/\[[A-Z]{3}\]/g, "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    if (result === "W") {
      const parts = plain.split(/\bd\.\s*/i);
      opponent = (parts[1] || "").trim();
    } else if (result === "L") {
      const parts = plain.split(/\bd\.\s*/i);
      opponent = (parts[0] || "").trim();
    } else {
      const parts = plain.split(/\bvs\b/i).map((s) => s.trim()).filter(Boolean);
      opponent = parts.length > 1 ? parts[parts.length - 1]! : "";
    }
    const surface = surfaceFromText(stripTags(tds[2] || ""));
    rows.push({
      date: stripTags(tds[0] || ""),
      isoDate: parseDate(stripTags(tds[0] || "")),
      tournament: stripTags(tds[1] || ""),
      surface,
      round: stripTags(tds[3] || "") || null,
      rank: num(stripTags(tds[4] || "")),
      oppRank: num(stripTags(tds[5] || "")),
      opponent,
      opponentCountry: oppCountry ? toIso2(oppCountry) : null,
      result,
      score: stripTags(tds[7] || "") || null,
      acePct: num(stripTags(tds[9] || "")),
      dfPct: num(stripTags(tds[10] || "")),
      firstInPct: num(stripTags(tds[11] || "")),
      firstWonPct: num(stripTags(tds[12] || "")),
      secondWonPct: num(stripTags(tds[13] || "")),
      bpSavedPct: num(stripTags(tds[14] || "")),
    });
  }
  return rows;
}

function avg(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((s, n) => s + n, 0) / xs.length;
}

function serveFrom(rows: FragRow[]): ServeLine | null {
  const done = rows.filter((r) => r.result !== "unplayed" && r.firstInPct != null);
  const sample = done.slice(0, 15);
  if (!sample.length) return null;
  const col = (k: keyof FragRow) => avg(sample.map((r) => r[k]).filter((n): n is number => typeof n === "number"));
  return {
    sample: sample.length,
    acePct: col("acePct"),
    dfPct: col("dfPct"),
    firstInPct: col("firstInPct"),
    firstWonPct: col("firstWonPct"),
    secondWonPct: col("secondWonPct"),
    bpSavedPct: col("bpSavedPct"),
    source: `Tennis Abstract, last ${sample.length} charted matches`,
  };
}

function formFrom(rows: FragRow[]): { w: number; l: number; n: number } | null {
  const done = rows.filter((r) => r.result === "W" || r.result === "L").slice(0, 10);
  if (!done.length) return null;
  return {
    w: done.filter((r) => r.result === "W").length,
    l: done.filter((r) => r.result === "L").length,
    n: done.length,
  };
}

/**
 * Recent-window rating. Starts at 1500 and only moves on matches that name an
 * opponent rank. Not comparable to Tennis Abstract Elo.
 */
function resultRatingFrom(rows: FragRow[]): { rating: number; n: number } | null {
  const done = rows
    .filter((r) => (r.result === "W" || r.result === "L") && r.oppRank != null && r.oppRank >= 1 && r.oppRank < 2500)
    .slice(0, 20)
    .reverse();
  if (done.length < 8) return null;
  let rating = 1500;
  const k = 24;
  for (const row of done) {
    const opp = rankPrior(row.oppRank!);
    if (opp == null) continue;
    const expected = eloWinProb(rating, opp);
    rating += k * ((row.result === "W" ? 1 : 0) - expected);
  }
  return { rating: Math.round(rating), n: done.length };
}

interface TourFile {
  city: string;
  tier: Tier;
  level: string | null;
  file: string;
}

function parseTourFiles(html: string): TourFile[] {
  const out: TourFile[] = [];
  const re = /\/current\/(20\d\d[^"]+)\.html/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(html))) {
    const file = m[1]!;
    if (seen.has(file)) continue;
    seen.add(file);
    const yearless = file.replace(/^20\d\d/, "");
    let tier: Tier = "atp";
    let level: string | null = null;
    if (/challenger/i.test(yearless)) tier = "challenger";
    else if (/wta/i.test(yearless)) {
      tier = "wta";
      const lvl = yearless.match(/(\d{3})/);
      level = lvl ? lvl[1]! : null;
    } else if (/itf/i.test(yearless)) tier = "itf";
    else tier = "atp";
    if (/finals/i.test(yearless)) level = "Finals";
    const city = yearless
      .replace(/Challenger|WTA|ATP|Nitto|ITF|Finals|\d+/gi, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim();
    if (!city) continue;
    out.push({ city, tier, level, file });
  }
  return out;
}

function tierFor(tour: Tour, tournament: string, title: string, files: TourFile[]): { tier: Tier; level: string | null } {
  if (tour === "itf") return { tier: "itf", level: itfLevel(title) };
  const blob = `${tournament} ${title}`.toLowerCase();
  if (blob.includes("challenger")) return { tier: "challenger", level: null };
  let best: TourFile | null = null;
  for (const f of files) {
    const city = f.city.toLowerCase();
    if (city.length < 4) continue;
    if (blob.includes(city)) {
      if (!best || f.city.length > best.city.length) best = f;
    }
  }
  if (best) return { tier: best.tier, level: best.level };
  if (tour === "wta") return { tier: "wta", level: null };
  if (/finals/i.test(blob)) return { tier: "atp", level: "Finals" };
  return { tier: "atp", level: null };
}

function indexByName<T extends { name: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    map.set(compactName(row.name), row);
    map.set(foldName(row.name), row);
  }
  return map;
}

function findByName<T extends { name: string }>(map: Map<string, T>, rows: T[], name: string): T | null {
  const hit = map.get(compactName(name)) || map.get(foldName(name));
  if (hit) return hit;
  const matches = rows.filter((r) => namesMatch(r.name, name));
  if (matches.length === 1) return matches[0]!;
  return null;
}

async function loadGamma(): Promise<RawEvent[]> {
  const all: RawEvent[] = [];
  for (const s of SERIES) {
    for (let offset = 0; offset <= 2000; offset += 100) {
      const url = `https://gamma-api.polymarket.com/events?series_id=${s.id}&closed=false&limit=100&offset=${offset}`;
      const batch = await fetchJson<RawEvent[]>(url);
      if (!Array.isArray(batch) || !batch.length) break;
      all.push(...batch);
      if (batch.length < 100) break;
      await sleep(150);
    }
  }
  return all;
}

async function loadEspn(tour: "atp" | "wta"): Promise<RankRow[]> {
  const data = await fetchJson<{ rankings?: { update?: string; ranks?: { current?: number; athlete?: { displayName?: string; citizenshipCountry?: string; flagAltText?: string; flag?: string; headshot?: { href?: string } } }[] }[] }>(
    `https://site.web.api.espn.com/apis/site/v2/sports/tennis/${tour}/rankings`,
  );
  const block = data.rankings?.[0];
  const asOf = block?.update ?? null;
  const rows: RankRow[] = [];
  for (const r of block?.ranks ?? []) {
    const name = r.athlete?.displayName;
    if (!name || r.current == null) continue;
    rows.push({
      tour,
      rank: r.current,
      name,
      countryCode: toIso2(r.athlete?.citizenshipCountry),
      countryName: r.athlete?.flagAltText ?? null,
      flagUrl: r.athlete?.flag ?? null,
      headshotUrl: r.athlete?.headshot?.href ?? null,
      asOf,
    });
  }
  return rows;
}

function h2h(rows: FragRow[], opponent: string): { w: number; l: number; n: number } | null {
  const hits = rows.filter((r) => r.result !== "unplayed" && r.opponent && namesMatch(r.opponent, opponent));
  if (!hits.length) return null;
  return {
    w: hits.filter((r) => r.result === "W").length,
    l: hits.filter((r) => r.result === "L").length,
    n: hits.length,
  };
}

function surfaceForMatch(startIso: string, tournament: string, aRows: FragRow[] | null, bRows: FragRow[] | null): { surface: Surface | null; source: string | null } {
  const start = Date.parse(startIso);
  const city = tournament.split(",")[0]!.split(":")[0]!.trim().toLowerCase();
  const token = city.replace(/^atp world tour finals.*/i, "finals").replace(/\batp\b|\bwta\b/g, "").trim();
  const hits: Surface[] = [];
  for (const rows of [aRows, bRows]) {
    if (!rows) continue;
    for (const row of rows) {
      if (!row.surface || !row.isoDate) continue;
      const t = Date.parse(row.isoDate + "T12:00:00Z");
      if (!Number.isFinite(t) || Math.abs(t - start) > 12 * 86_400_000) continue;
      const tourney = row.tournament.toLowerCase();
      if (token.length >= 4 && (tourney.includes(token) || token.includes(tourney.replace(/ ch$/, "").trim()))) {
        hits.push(row.surface);
      }
    }
  }
  if (!hits.length) return { surface: null, source: null };
  const first = hits[0]!;
  if (hits.every((h) => h === first)) {
    return { surface: first, source: "Tennis Abstract recent-result row for this tournament" };
  }
  return { surface: null, source: null };
}

function roundFor(startIso: string, tournament: string, rows: FragRow[] | null, opponent: string): string | null {
  if (!rows) return null;
  const start = Date.parse(startIso);
  const token = tournament.split(":")[0]!.split(",")[0]!.trim().toLowerCase();
  for (const row of rows) {
    if (!row.round || !row.isoDate) continue;
    if (!namesMatch(row.opponent, opponent) && !row.opponent) continue;
    const oppOk = namesMatch(row.opponent, opponent);
    const t = Date.parse(row.isoDate + "T12:00:00Z");
    if (!Number.isFinite(t) || Math.abs(t - start) > 8 * 86_400_000) continue;
    const tourney = row.tournament.toLowerCase();
    if (oppOk && token.length >= 4 && tourney.includes(token.slice(0, Math.min(token.length, 6)))) return row.round;
  }
  return null;
}

function commonsFileFromThumb(thumbUrl: string): string | null {
  const clean = thumbUrl.split("?")[0] ?? "";
  const sized = clean.match(/\/([^/]+)\/\d+px-[^/]+$/);
  if (sized) return decodeURIComponent(sized[1]!).replace(/_/g, " ");
  const direct = clean.match(/\/wikipedia\/commons\/(?:[0-9a-f]\/)+([^/]+)$/i);
  return direct ? decodeURIComponent(direct[1]!).replace(/_/g, " ") : null;
}

/** Wikimedia lead photo only when the article is that person and describes a tennis player. */
async function wikiPhoto(name: string): Promise<PhotoCredit | null> {
  const cacheFile = path.join(CACHE, "wiki", `${playerId(name)}.json`);
  try {
    const raw = await readFile(cacheFile, "utf8");
    return JSON.parse(raw) as PhotoCredit | null;
  } catch {
    /* fetch */
  }
  await sleep(250);
  let titles: string[] = [];
  try {
    const data = await fetchJson<[string, string[]]>(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(name)}&limit=5&namespace=0&format=json`,
    );
    titles = data[1] ?? [];
  } catch {
    titles = [];
  }
  let credit: PhotoCredit | null = null;
  for (const title of titles) {
    const bare = title.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
    if (!namesMatch(bare, name)) continue;
    await sleep(220);
    try {
      const summary = await fetchJson<{
        description?: string;
        thumbnail?: { source?: string };
        originalimage?: { source?: string };
        content_urls?: { desktop?: { page?: string } };
      }>(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
      const desc = (summary.description ?? "").toLowerCase();
      if (!desc.includes("tennis player")) continue;
      const thumb = summary.thumbnail?.source || summary.originalimage?.source;
      if (!thumb) continue;
      let license: string | null = null;
      let attribution = "Wikimedia Commons";
      const file = commonsFileFromThumb(thumb);
      if (file) {
        await sleep(220);
        try {
          const info = await fetchJson<{ query?: { pages?: Record<string, { imageinfo?: { extmetadata?: Record<string, { value?: string }> }[] }> } }>(
            `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent("File:" + file)}&prop=imageinfo&iiprop=extmetadata&format=json`,
          );
          const meta = Object.values(info.query?.pages ?? {})[0]?.imageinfo?.[0]?.extmetadata ?? {};
          license = meta.LicenseShortName?.value ?? null;
          attribution = stripTags(meta.Artist?.value ?? meta.Credit?.value ?? attribution);
        } catch {
          /* photo still usable; credit the commons file */
        }
      }
      credit = {
        url: thumb,
        pageUrl: summary.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
        license,
        attribution,
        source: "wikimedia",
      };
      break;
    } catch {
      continue;
    }
  }
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, JSON.stringify(credit));
  return credit;
}

interface WtaHit {
  countryCode: string | null;
  rank: number | null;
  rankAsOf: string | null;
  form: { w: number; l: number; n: number } | null;
}

function formFromWta(matches: Record<string, unknown>[] | undefined, playerIdNum: number): { w: number; l: number; n: number } | null {
  const cutoff = Date.now() - 540 * 86_400_000;
  const rows = (matches ?? []).filter((m) => {
    if (m.s_d_flag && m.s_d_flag !== "S") return false;
    const start = Date.parse(String(m.StartDate ?? ""));
    if (!Number.isFinite(start) || start < cutoff) return false;
    const winner = Number(m.winner);
    return winner === 1 || winner === 2;
  }).slice(0, 10);
  if (!rows.length) return null;
  let w = 0;
  let l = 0;
  for (const m of rows) {
    const p1 = Number(m.player_1);
    const winner = Number(m.winner);
    const won = p1 === playerIdNum ? winner === 1 : winner === 2;
    if (won) w += 1;
    else l += 1;
  }
  return { w, l, n: w + l };
}

async function loadWta(name: string): Promise<WtaHit | null> {
  const cacheFile = path.join(CACHE, "wta", `${playerId(name)}.json`);
  try {
    const stat = await import("node:fs/promises").then((fs) => fs.stat(cacheFile));
    if (Date.now() - stat.mtimeMs < 18 * 3600_000) {
      return JSON.parse(await readFile(cacheFile, "utf8")) as WtaHit | null;
    }
  } catch {
    /* fetch */
  }
  await sleep(200);
  let hit: { id?: number; fullName?: string; countryCode?: string } | null = null;
  try {
    const data = await fetchJson<{ content?: { id?: number; fullName?: string; countryCode?: string }[] }>(
      `https://api.wtatennis.com/tennis/players?name=${encodeURIComponent(name)}`,
    );
    hit = (data.content ?? []).find((p) => p.fullName && namesMatch(p.fullName, name)) ?? null;
  } catch {
    hit = null;
  }
  let profile: WtaHit | null = null;
  if (hit?.id) {
    await sleep(180);
    try {
      const ranking = await fetchJson<{ weeklyRankings?: { singlesRanking?: number; rankedAt?: string }[] }>(
        `https://api.wtatennis.com/tennis/players/${hit.id}/ranking`,
      );
      const week = ranking.weeklyRankings?.[0];
      const rawRank = week?.singlesRanking;
      const rank = rawRank != null && rawRank > 0 && rawRank < 5000 ? rawRank : null;
      await sleep(180);
      const matches = await fetchJson<{ matches?: Record<string, unknown>[] }>(
        `https://api.wtatennis.com/tennis/players/${hit.id}/matches?page=0&pageSize=20&sort=desc`,
      );
      profile = {
        countryCode: toIso2(hit.countryCode),
        rank,
        rankAsOf: week?.rankedAt ?? null,
        form: formFromWta(matches.matches, hit.id),
      };
    } catch {
      profile = { countryCode: toIso2(hit.countryCode), rank: null, rankAsOf: null, form: null };
    }
  }
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, JSON.stringify(profile));
  return profile;
}

function contextRank(ctx: PlayerContext | null): number {
  if (!ctx) return 9;
  if (ctx.status === "live") return 0;
  if (ctx.status === "upcoming") return 1;
  if (ctx.status === "suspended") return 2;
  return 3;
}

function matchContext(m: MatchView, side: "a" | "b"): PlayerContext {
  const other = side === "a" ? m.playerB : m.playerA;
  return {
    tournament: m.tournament,
    tier: m.tier,
    level: m.level,
    tour: m.tour,
    opponent: other.name,
    opponentId: other.id,
    status: m.status,
    startTime: m.startTime,
    ownPrice: side === "a" ? m.priceA : m.priceB,
    opponentPrice: side === "a" ? m.priceB : m.priceA,
    surface: m.surface,
    polymarketUrl: m.polymarketUrl,
    pickName: m.pick?.playerName ?? null,
  };
}

function sideInput(p: PlayerSummary, useResult: boolean): SideInput {
  return {
    elo: p.elo,
    hElo: p.hElo,
    cElo: p.cElo,
    gElo: p.gElo,
    rank: p.rank,
    form: p.form,
    firstInPct: p.serve?.firstInPct ?? null,
    firstWonPct: p.serve?.firstWonPct ?? null,
    serveSample: p.serve?.sample ?? null,
    resultElo: p.resultRating,
    useResultElo: useResult,
  };
}

function recentRows(rows: FragRow[]): RecentRow[] {
  return rows.slice(0, 12).map((r) => ({
    date: r.isoDate || r.date,
    tournament: r.tournament,
    surface: r.surface,
    round: r.round,
    rank: r.rank,
    opponent: r.opponent,
    opponentId: r.opponent ? playerId(r.opponent) : null,
    result: r.result,
    score: r.score,
    acePct: r.acePct,
    dfPct: r.dfPct,
    firstInPct: r.firstInPct,
    firstWonPct: r.firstWonPct,
  }));
}

async function main() {
  const now = Date.now();
  const generatedAt = new Date(now).toISOString();
  await mkdir(OUT, { recursive: true });
  await mkdir(path.join(OUT, "players"), { recursive: true });

  let previous: BoardView | null = null;
  try {
    previous = JSON.parse(await readFile(path.join(OUT, "board.json"), "utf8")) as BoardView;
  } catch {
    previous = null;
  }
  const previousPicks = new Map<string, LockedPick>();
  for (const m of previous?.matches ?? []) {
    if (m.pick) previousPicks.set(m.id, m.pick);
  }

  console.log("fetching polymarket…");
  const events = await loadGamma();
  console.log("events", events.length);

  console.log("fetching tennis abstract index + elo…");
  const home = await cached(path.join(CACHE, "ta-home.html"), 12 * 3600_000, () => fetchText("https://www.tennisabstract.com/"));
  const files = parseTourFiles(home);
  const atpEloHtml = await cached(path.join(CACHE, "atp-elo.html"), 12 * 3600_000, () => fetchText("https://www.tennisabstract.com/reports/atp_elo_ratings.html"));
  const wtaEloHtml = await cached(path.join(CACHE, "wta-elo.html"), 12 * 3600_000, () => fetchText("https://www.tennisabstract.com/reports/wta_elo_ratings.html"));
  const atpElo = parseElo(atpEloHtml, "atp");
  const wtaElo = parseElo(wtaEloHtml, "wta");
  console.log("elo", atpElo.rows.length, wtaElo.rows.length, "updated", atpElo.updated, wtaElo.updated);
  const eloRows = [...atpElo.rows, ...wtaElo.rows];
  const eloMap = indexByName(eloRows);

  console.log("fetching espn rankings…");
  let ranks: RankRow[] = [];
  const rankNotes: string[] = [];
  try {
    const atpR = await loadEspn("atp");
    const wtaR = await loadEspn("wta");
    ranks = [...atpR, ...wtaR];
    rankNotes.push(`ESPN ATP rankings n=${atpR.length} as of ${atpR[0]?.asOf ?? "unknown"}.`);
    rankNotes.push(`ESPN WTA rankings n=${wtaR.length} as of ${wtaR[0]?.asOf ?? "unknown"}.`);
  } catch (err) {
    rankNotes.push(`ESPN rankings failed: ${err instanceof Error ? err.message : String(err)}. Ranks from ESPN are omitted.`);
  }
  const rankMap = indexByName(ranks);

  const kept = events.filter((ev) => classifyEvent(ev, now) !== "ignore");
  console.log("kept", kept.length);

  const namesNeeded = new Set<string>();
  for (const ev of kept) {
    for (const t of ev.teams ?? []) if (t.name) namesNeeded.add(t.name);
    const ml = moneyline(ev);
    if (ml) for (const n of outcomeMids(ml).names) namesNeeded.add(n);
  }

  const fragLimit = Number(process.env.TENNIS_FRAG_LIMIT || 700);
  const slugByName = new Map<string, string>();
  for (const name of namesNeeded) {
    const elo = findByName(eloMap, eloRows, name);
    if (elo) slugByName.set(name, elo.slug);
    else {
      const guess = taSlugCandidates(name)[0];
      if (guess) slugByName.set(name, guess);
    }
  }
  const slugTargets = [...slugByName.entries()].map(([name, slug]) => ({ name, slug }));
  console.log("frag targets", Math.min(slugTargets.length, fragLimit), "of", slugTargets.length);

  const frags = new Map<string, FragRow[]>();
  let fetched = 0;
  for (const target of slugTargets.slice(0, fragLimit)) {
    const file = path.join(CACHE, "frags", `${target.slug}.js`);
    try {
      const js = await cached(file, 18 * 3600_000, async () => {
        await sleep(450);
        fetched += 1;
        try {
          return await fetchText(`https://www.tennisabstract.com/jsfrags/${encodeURIComponent(target.slug)}.js`);
        } catch {
          return "/* missing */";
        }
      });
      const rows = js.includes("player_frag") ? parseFrag(js) : [];
      frags.set(compactName(target.name), rows);
      frags.set(target.slug, rows);
    } catch (err) {
      console.warn("frag miss", target.slug, err instanceof Error ? err.message : err);
      frags.set(compactName(target.name), []);
    }
  }
  console.log("frags fetched fresh", fetched, "with rows", [...frags.values()].filter((r) => r.length).length);

  const women = new Set<string>();
  for (const ev of kept) {
    const title = ev.title || "";
    const tour = eventTour(ev);
    const womenEvent = tour === "wta" || /^W\d{2,3}\b/.test(title) || /\bW\d{2,3}\b/.test(title.split(":")[0] || "");
    if (!womenEvent) continue;
    for (const t of ev.teams ?? []) if (t.name) women.add(t.name);
  }
  const wtaByName = new Map<string, WtaHit>();
  console.log("wta lookups", women.size);
  for (const name of women) {
    const hit = await loadWta(name);
    if (hit) wtaByName.set(compactName(name), hit);
  }
  console.log("wta hits", wtaByName.size);

  const photoLimit = Number(process.env.TENNIS_PHOTO_LIMIT || 120);
  const rankedNames = [...namesNeeded].filter((n) => slugByName.has(n) || findByName(rankMap, ranks, n));
  const liveNames: string[] = [];
  for (const ev of kept) {
    const st = classifyEvent(ev, now);
    if (st === "live" || st === "suspended") {
      for (const t of ev.teams ?? []) if (t.name) liveNames.push(t.name);
    }
  }
  // Known players first so the hero is not filled with ITF initials while ATP photos wait.
  const photoQueue = [...new Set([...rankedNames, ...liveNames])].slice(0, photoLimit);
  console.log("photos", photoQueue.length);
  const photos = new Map<string, PhotoCredit | null>();
  for (const name of photoQueue) {
    try {
      photos.set(compactName(name), await wikiPhoto(name));
    } catch {
      photos.set(compactName(name), null);
    }
  }

  const matches: MatchView[] = [];
  for (const ev of kept) {
    const status = classifyEvent(ev, now);
    if (status === "ignore") continue;
    const tour = eventTour(ev)!;
    const ml = moneyline(ev);
    if (!ml || !ev.id || !ev.slug || !ev.startTime) continue;
    const mids = outcomeMids(ml);
    const teams = ev.teams ?? [];
    const nameA = teams.find((t) => t.ordering === "home")?.name || mids.names[0];
    const nameB = teams.find((t) => t.ordering === "away")?.name || mids.names[1];
    if (!nameA || !nameB) continue;
    const priceFor = (name: string) => {
      const idx = mids.names.findIndex((n) => namesMatch(n, name));
      return idx >= 0 ? mids.prices[idx] ?? null : null;
    };
    const { tournament } = tournamentFromTitle(ev.title || `${nameA} vs ${nameB}`);
    const tierInfo = tierFor(tour, tournament, ev.title || "", files);
    const eloA = findByName(eloMap, eloRows, nameA);
    const eloB = findByName(eloMap, eloRows, nameB);
    const rankA = findByName(rankMap, ranks, nameA);
    const rankB = findByName(rankMap, ranks, nameB);
    const rowsA = frags.get(compactName(nameA)) ?? (eloA ? frags.get(eloA.slug) ?? null : null);
    const rowsB = frags.get(compactName(nameB)) ?? (eloB ? frags.get(eloB.slug) ?? null : null);
    const surf = surfaceForMatch(ev.startTime, tournament, rowsA, rowsB);
    const textSurf = surfaceFromText(ev.description);
    const surface = surf.surface || textSurf;
    const surfaceSource = surf.surface ? surf.source : textSurf ? "Polymarket description" : null;

    const rankFromFrag = (rows: FragRow[] | null) => {
      const hit = rows?.find((r) => r.rank != null && r.isoDate);
      return hit?.rank ?? null;
    };

    const buildPlayer = (name: string, team: { logo?: string } | undefined, elo: EloRow | null, rank: RankRow | null, rows: FragRow[] | null, opponent: string, womenEvent: boolean): PlayerSummary => {
      const fragRank = rankFromFrag(rows);
      const wta = wtaByName.get(compactName(name)) ?? null;
      const flagCode = countryFromFlagUrl(team?.logo);
      const countryCode = flagCode || wta?.countryCode || rank?.countryCode || null;
      const serve = rows ? serveFrom(rows) : null;
      const form = (rows && formFrom(rows)) || wta?.form || null;
      const rankValue = rank?.rank ?? wta?.rank ?? fragRank;
      const rankTour: "ATP" | "WTA" | null = rankValue == null ? null : womenEvent || rank?.tour === "wta" || wta ? "WTA" : "ATP";
      const rankSource = rank
        ? `ESPN ${rank.tour.toUpperCase()} rankings${rank.asOf ? ` ${rank.asOf}` : ""}`
        : wta?.rank
          ? `WTA singles ranking${wta.rankAsOf ? ` ${wta.rankAsOf.slice(0, 10)}` : ""}`
          : fragRank
            ? "Tennis Abstract recent-result rank column"
            : null;
      const rating = rows ? resultRatingFrom(rows) : null;
      const wiki = photos.get(compactName(name)) ?? null;
      const photo: PhotoCredit | null = wiki?.url
        ? wiki
        : rank?.headshotUrl
          ? { url: rank.headshotUrl, pageUrl: null, license: null, attribution: "ESPN", source: "espn" }
          : null;
      return {
        id: playerId(name),
        name,
        countryCode,
        countryName: rank?.countryName && !flagCode && !wta?.countryCode ? rank.countryName : countryName(countryCode),
        flagUrl: (countryCode && team?.logo && !team.logo.includes("/un.png") ? team.logo : null) || rank?.flagUrl || null,
        rank: rankValue,
        rankTour: rankValue == null ? null : rankTour,
        rankSource,
        elo: elo?.elo ?? null,
        hElo: elo?.hElo ?? null,
        cElo: elo?.cElo ?? null,
        gElo: elo?.gElo ?? null,
        eloSource: elo ? `Tennis Abstract ${elo.tour.toUpperCase()} Elo${elo.updated ? `, updated ${elo.updated}` : ""}` : null,
        photo,
        form,
        serve,
        recentH2h: rows ? h2h(rows, opponent) : null,
        resultRating: rating?.rating ?? null,
        resultRatingN: rating?.n ?? null,
        resultRatingSource: rating ? `Polyverse recent-window rating from ${rating.n} Tennis Abstract matches with an opponent rank. Starts at 1500. Not Tennis Abstract Elo.` : null,
      };
    };

    const teamA = teams.find((t) => t.name && namesMatch(t.name, nameA));
    const teamB = teams.find((t) => t.name && namesMatch(t.name, nameB));
    const womenEvent = tour === "wta" || Boolean(tierInfo.level?.startsWith("W"));
    const playerA = buildPlayer(nameA, teamA, eloA, rankA, rowsA, nameB, womenEvent);
    const playerB = buildPlayer(nameB, teamB, eloB, rankB, rowsB, nameA, womenEvent);
    const sets = parseSets(ev.score);
    const won = setsWon(sets, status);
    const marketClosed = Boolean(ml.closed || ev.closed);
    const resolution = resolutionFromPrices(priceFor(nameA), priceFor(nameB), marketClosed, "polymarket moneyline");

    const match: MatchView = {
      id: String(ev.id),
      slug: ev.slug,
      title: ev.title || `${nameA} vs ${nameB}`,
      tour,
      tier: tierInfo.tier,
      level: tierInfo.level,
      tournament,
      round: roundFor(ev.startTime, tournament, rowsA, nameB) || roundFor(ev.startTime, tournament, rowsB, nameA),
      surface,
      surfaceSource,
      startTime: ev.startTime,
      period: ev.period ?? null,
      scoreRaw: ev.score ?? null,
      sets,
      setsWonA: won.a,
      setsWonB: won.b,
      server: serverSide(ev, nameA, nameB),
      status,
      playerA,
      playerB,
      priceA: priceFor(nameA),
      priceB: priceFor(nameB),
      volume: volumeOf(ml),
      marketClosed,
      polymarketUrl: `https://polymarket.com/event/${ev.slug}`,
      pick: null,
      result: null,
    };

    const existing = previousPicks.get(match.id);
    if (existing) {
      match.pick = existing;
    } else if (Date.parse(match.startTime) > now) {
      const useResult = playerA.elo == null && playerB.elo == null && playerA.resultRating != null && playerB.resultRating != null;
      match.pick = draftPick({
        nowMs: now,
        startMs: Date.parse(match.startTime),
        surface: match.surface,
        playerA: sideInput(playerA, useResult),
        playerB: sideInput(playerB, useResult),
        priceA: match.priceA,
        priceB: match.priceB,
        playerAId: playerA.id,
        playerBId: playerB.id,
        playerAName: playerA.name,
        playerBName: playerB.name,
      });
    }

    if (match.pick && (match.status === "finished" || match.status === "void" || resolution.kind !== "open")) {
      const graded = gradePick(match.pick, resolution.kind === "open" && match.status === "finished" ? resolution : resolution, generatedAt);
      // Only attach a grade when Polymarket has actually resolved. A finished
      // period with an open price is not a result.
      if (resolution.kind !== "open") match.result = graded;
    }
    matches.push(match);
  }

  matches.sort((a, b) => {
    const order = { live: 0, suspended: 1, upcoming: 2, finished: 3, void: 4 };
    const d = order[a.status] - order[b.status];
    if (d) return d;
    return a.startTime.localeCompare(b.startTime);
  });

  const notes = [
    "Singles match-winner markets only (Polymarket series ATP 10365, WTA 10366, ITF 11634). Doubles series are not queried.",
    "The live board lists only matches in play or still to start. Suspended, finished, voided, and events gamma marks ended are kept off this page. Finished results stay on /tennis/record.",
    "Picks are written only when startTime is still in the future at generation. A rebuild keeps any pick already stored for that event id.",
    `Model ${INPUTS_VERSION}. Surface Elo is used only when a Tennis Abstract recent row names this tournament and a surface. Otherwise overall Elo, then rank prior, then the market.`,
    ...rankNotes,
    `Tennis Abstract Elo rows: ATP ${atpElo.rows.length} (updated ${atpElo.updated ?? "unknown"}), WTA ${wtaElo.rows.length} (updated ${wtaElo.updated ?? "unknown"}).`,
    "Photos: Wikimedia Commons when the article is that tennis player, else an ESPN headshot from the rankings feed when one is published. Otherwise initials.",
    "Country comes from the Polymarket team flag when it is not the unknown flag, else the WTA player record for women, else ESPN rankings.",
    "A recent-window rating is stored only when at least 8 Tennis Abstract matches list an opponent rank. It is not Tennis Abstract Elo and is used in a pick only when neither player has a Tennis Abstract Elo.",
    "Serve lines are averages of up to 15 charted Tennis Abstract matches. Empty cells in the source stay out of the average. If there is no sample, the stat is omitted.",
    "No settled grade is stored unless the moneyline is closed at about 100¢ or voided at 50–50.",
  ];

  const visible = matches.filter((m) => isBoardMatch(m, now));
  const board: BoardView = {
    generatedAt,
    inputsVersion: INPUTS_VERSION,
    source: "snapshot",
    matches: visible,
    record: summarize(matches),
    sources: {
      markets: "https://gamma-api.polymarket.com/events?series_id={10365,10366,11634}",
      elo: "https://www.tennisabstract.com/reports/atp_elo_ratings.html",
      rankings: "https://site.web.api.espn.com/apis/site/v2/sports/tennis/{atp|wta}/rankings",
      photos: "https://en.wikipedia.org",
      trades: "https://share.xyz/r/polyverse",
    },
    notes,
  };

  const record = buildRecord(matches, generatedAt, INPUTS_VERSION);

  const byPlayer = new Map<string, { summary: PlayerSummary; recent: RecentRow[]; picks: PlayerProfile["picks"]; context: PlayerContext | null }>();
  const remember = (p: PlayerSummary, rows: FragRow[] | null, context: PlayerContext) => {
    const cur = byPlayer.get(p.id);
    if (!cur) byPlayer.set(p.id, { summary: p, recent: rows ? recentRows(rows) : [], picks: [], context });
    else if (contextRank(context) < contextRank(cur.context)) cur.context = context;
  };
  for (const m of matches) {
    const rowsA = frags.get(compactName(m.playerA.name)) ?? null;
    const rowsB = frags.get(compactName(m.playerB.name)) ?? null;
    remember(m.playerA, rowsA, matchContext(m, "a"));
    remember(m.playerB, rowsB, matchContext(m, "b"));
    if (m.pick) {
      const row = {
        matchId: m.id,
        slug: m.slug,
        tournament: m.tournament,
        tier: m.tier,
        surface: m.surface,
        startTime: m.startTime,
        playerA: m.playerA.name,
        playerB: m.playerB.name,
        pick: m.pick,
        result: m.result,
        status: m.status,
      };
      byPlayer.get(m.playerA.id)?.picks.push(row);
      byPlayer.get(m.playerB.id)?.picks.push(row);
    }
  }

  await writeFile(path.join(OUT, "board.json"), JSON.stringify(board));
  await writeFile(path.join(OUT, "record.json"), JSON.stringify(record));
  const coverage = coverageReport(visible, generatedAt);
  await writeFile(path.join(OUT, "coverage.json"), JSON.stringify(coverage, null, 2));
  console.log("coverage");
  for (const row of coverage.rows) {
    console.log(
      row.tier,
      `n=${row.players}`,
      `country ${row.countryPct}%`,
      `photo ${row.photoPct}%`,
      `rank ${row.rankPct}%`,
      `elo ${row.eloPct}%`,
      `form ${row.formPct}%`,
      `serve ${row.servePct}%`,
    );
  }
  await writeFile(
    path.join(OUT, "methodology.json"),
    JSON.stringify({ version: INPUTS_VERSION, sections: METHODOLOGY_SECTIONS }, null, 2),
  );
  const reference = {
    generatedAt,
    inputsVersion: INPUTS_VERSION,
    elo: eloRows.map((r) => ({ name: r.name, slug: r.slug, tour: r.tour, elo: r.elo, hElo: r.hElo, cElo: r.cElo, gElo: r.gElo, updated: r.updated })),
    rankings: ranks,
    tours: files,
  };
  await writeFile(path.join(OUT, "reference.json"), JSON.stringify(reference));

  for (const [id, body] of byPlayer) {
    const profile: PlayerProfile = {
      player: body.summary,
      recent: body.recent,
      picks: body.picks,
      generatedAt,
      context: body.context,
    };
    await writeFile(path.join(OUT, "players", `${id}.json`), JSON.stringify(profile));
  }

  const picked = visible.filter((m) => m.pick).length;
  const live = visible.filter((m) => m.status === "live").length;
  console.log(`wrote board ${visible.length} (live ${live}) of ${matches.length} kept, ${picked} board picks, players ${byPlayer.size}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
