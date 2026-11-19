/* Generated from src/server/tennis. Rebundle with esbuild after editing those sources. */

// src/server/tennis/store.ts
var pool = null;
async function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (pool) return pool;
  const mod = await import("pg");
  const PoolCtor = mod.Pool ?? mod.default?.Pool;
  if (!PoolCtor) throw new Error("pg Pool export missing");
  const ssl = /localhost|127\.0\.0\.1/.test(url) ? void 0 : { rejectUnauthorized: false };
  pool = new PoolCtor({ connectionString: url, max: 1, ssl });
  return pool;
}
var SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tennis_matches (
  id TEXT PRIMARY KEY,
  start_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tennis_matches_start_idx ON tennis_matches (start_time);
CREATE TABLE IF NOT EXISTS tennis_picks (
  match_id TEXT PRIMARY KEY REFERENCES tennis_matches (id),
  picked_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS tennis_results (
  match_id TEXT PRIMARY KEY REFERENCES tennis_matches (id),
  settled_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL
);
`;
var schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  await db.query(SCHEMA_SQL);
  schemaReady = true;
}
function cronAuthorized(header) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const value = Array.isArray(header) ? header[0] : header;
  return value === `Bearer ${secret}`;
}

// src/server/tennis/jobs.ts
import { readFile } from "node:fs/promises";
import path from "node:path";

// src/lib/tennis/methodology.ts
var INPUTS_VERSION = "polyverse-tennis-v1";
var ELO_SCALE = 400;
var RANK_PRIOR_BASE = 2200;
var RANK_PRIOR_LOG_K = 105;
var RANK_PULL = 0.08;
var RANK_PULL_CAP = 25;
var FORM_PER_RESULT = 3;
var FORM_CAP = 18;
var FORM_MIN_N = 5;
var FORM_WINDOW = 10;
var FIRST_IN_PER_PP = 0.35;
var FIRST_WON_PER_PP = 0.25;
var SERVE_CAP = 12;
var SERVE_MIN_N = 5;
var VALUE_EDGE = 0.05;
var VALUE_PRICE_CAP = 0.93;
var LOG_LOSS_CLIP = 1e-3;
var METHODOLOGY_SECTIONS = [
  {
    heading: "What this book is",
    body: [
      "Polyverse publishes a pre-match pick for every open Polymarket tennis singles match-winner market (ATP, WTA, Challenger, ITF). Doubles are excluded.",
      "Polyverse does not place orders, connect wallets, or hold an account for you. Every trade control on this site is a link to Share.",
      "A pick is written once, before the scheduled start, and is never edited or backfilled. If a match is already live when this book first sees it, the pick cell stays empty."
    ]
  },
  {
    heading: "Win probability",
    body: [
      "When both players have a Tennis Abstract rating, P(A) = 1 / (1 + 10^((R_B \u2212 R_A) / 400)).",
      "If the match surface is known from a Tennis Abstract recent-result row for that tournament, the surface rating is used (hElo, cElo, or gElo). Those figures are already Tennis Abstract's blend of overall Elo and a surface-only rating. If the surface is unknown, overall Elo is used and confidence is capped at medium.",
      `If Elo is missing, a rank prior is used: ${RANK_PRIOR_BASE} \u2212 ${RANK_PRIOR_LOG_K}\xB7ln(rank). It is labelled rank-prior, not Elo.`,
      `When both Elo and rank exist, the rating is pulled ${RANK_PULL * 100}% of the way from Elo toward the rank prior, capped at \xB1${RANK_PULL_CAP} points.`,
      `Recent form, when at least ${FORM_MIN_N} completed matches exist in the last ${FORM_WINDOW} Tennis Abstract rows, adds (wins \u2212 losses) \xD7 ${FORM_PER_RESULT} points, capped at \xB1${FORM_CAP}.`,
      `First-serve in and first-serve points won add a small gap between the two players (\xD7${FIRST_IN_PER_PP} and \xD7${FIRST_WON_PER_PP} per percentage point, each capped at \xB1${SERVE_CAP}) only when both samples have at least ${SERVE_MIN_N} matches. Hold% and return% are not invented from other columns.`,
      "If either player has neither Elo nor a rank, the match falls back to the Polymarket mid as the model probability. Confidence is low. The side above 50% is still picked. Edge is then about zero, so it is not marked VALUE.",
      "A tie at exactly 50% breaks to the better (lower) rank, then to the higher market price, then to side A. The tie-break is recorded as low confidence."
    ]
  },
  {
    heading: "VALUE flag",
    body: [
      `VALUE means the locked model probability on the picked side exceeds the Polymarket mid by at least ${VALUE_EDGE * 100} percentage points.`,
      `Favourites priced at or above ${VALUE_PRICE_CAP * 100}\xA2 are never flagged VALUE, even if the model is higher.`
    ]
  },
  {
    heading: "Grading",
    body: [
      "A pick is graded only after Polymarket resolves the match-winner market, or the event is void.",
      "Winner: the outcome priced at about 100\xA2 when the market is closed. Flat stake is 1 unit risked at the pick-time price p. Win pnl = (1 \u2212 p) / p. Loss pnl = \u22121. ROI is total pnl divided by the number of non-void settled picks.",
      "Void: a closed market resolved at 50\u201350 (cancelled, or not played). Voids are listed and excluded from W\u2013L, ROI, Brier, and log loss.",
      "Retirement after the match has started follows the Polymarket resolution and counts. Retirement or cancellation before the start, when the market voids at 50\u201350, does not count.",
      `Brier score is the mean of (p \u2212 y)\xB2 on the picked-side probability, y = 1 if that side won. Log loss clips p into [${LOG_LOSS_CLIP}, ${1 - LOG_LOSS_CLIP}] before \u2212(y\xB7ln p + (1\u2212y)\xB7ln(1\u2212p)).`
    ]
  },
  {
    heading: "What is not in v1",
    body: [
      "No in-play updating of the locked number. The scoreboard is live; the pick is pre-match.",
      "No doubles. No api-tennis.com feed unless API_TENNIS_KEY is configured later. The provider interface is in the repo; the free path is ESPN rankings, Tennis Abstract Elo and recent rows, Wikimedia photos, and Polymarket.",
      "Missing numbers are shown as an em dash. They are not filled with zeros or league averages."
    ]
  }
];

// src/lib/tennis/grade.ts
function flatStakePnl(price, won) {
  if (!(price > 0 && price < 1)) return null;
  return won ? (1 - price) / price : -1;
}
function brier(prob, won) {
  const y = won ? 1 : 0;
  return (prob - y) ** 2;
}
function logLoss(prob, won) {
  const p = Math.min(1 - LOG_LOSS_CLIP, Math.max(LOG_LOSS_CLIP, prob));
  const y = won ? 1 : 0;
  return -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
}
function resolutionFromPrices(priceA, priceB, marketClosed, source) {
  if (!marketClosed || priceA == null || priceB == null) return { kind: "open", winnerSide: null, source };
  const aWin = priceA >= 0.99 && priceB <= 0.02;
  const bWin = priceB >= 0.99 && priceA <= 0.02;
  if (aWin) return { kind: "winner", winnerSide: "a", source };
  if (bWin) return { kind: "winner", winnerSide: "b", source };
  if (Math.abs(priceA - 0.5) <= 0.02 && Math.abs(priceB - 0.5) <= 0.02) {
    return { kind: "void", winnerSide: null, source };
  }
  return { kind: "open", winnerSide: null, source };
}
function gradePick(pick, resolution, settledAt) {
  if (resolution.kind === "open") return null;
  if (resolution.kind === "void") {
    return {
      settledAt,
      kind: "void",
      winnerSide: null,
      source: resolution.source,
      pickWon: null,
      pnlFlat1u: null,
      brier: null,
      logLoss: null
    };
  }
  const won = resolution.winnerSide === pick.side;
  const price = pick.marketPrice;
  return {
    settledAt,
    kind: "winner",
    winnerSide: resolution.winnerSide,
    source: resolution.source,
    pickWon: won,
    pnlFlat1u: price == null ? null : flatStakePnl(price, won),
    brier: brier(pick.modelProb, won),
    logLoss: logLoss(pick.modelProb, won)
  };
}

// src/lib/tennis/model.ts
function rankPrior(rank) {
  if (!Number.isFinite(rank) || rank < 1) return null;
  return RANK_PRIOR_BASE - RANK_PRIOR_LOG_K * Math.log(rank);
}
function eloWinProb(ratingA, ratingB) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / ELO_SCALE));
}
function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}
function surfaceElo(p, surface) {
  if (!surface) return null;
  const v = surface === "Hard" ? p.hElo : surface === "Clay" ? p.cElo : p.gElo;
  if (v == null || !Number.isFinite(v)) return null;
  return { value: v, kind: "surface-elo" };
}
function baseRating(p, surface) {
  const surf = surfaceElo(p, surface);
  if (surf) return { rating: surf.value, kind: "surface-elo" };
  if (p.elo != null && Number.isFinite(p.elo)) return { rating: p.elo, kind: "overall-elo" };
  if (p.rank != null) {
    const prior = rankPrior(p.rank);
    if (prior != null) return { rating: prior, kind: "rank-prior" };
  }
  return null;
}
function formAdj(p) {
  const f = p.form;
  if (!f || f.n < FORM_MIN_N) return 0;
  const windowN = Math.min(f.n, FORM_WINDOW);
  if (f.w + f.l < FORM_MIN_N) return 0;
  void windowN;
  return clamp((f.w - f.l) * FORM_PER_RESULT, -FORM_CAP, FORM_CAP);
}
function serveDelta(a, b) {
  const sampleOk = (a.serveSample ?? 0) >= SERVE_MIN_N && (b.serveSample ?? 0) >= SERVE_MIN_N;
  if (!sampleOk) return 0;
  let adj = 0;
  if (a.firstInPct != null && b.firstInPct != null) {
    adj += clamp((a.firstInPct - b.firstInPct) * FIRST_IN_PER_PP, -SERVE_CAP, SERVE_CAP);
  }
  if (a.firstWonPct != null && b.firstWonPct != null) {
    adj += clamp((a.firstWonPct - b.firstWonPct) * FIRST_WON_PER_PP, -SERVE_CAP, SERVE_CAP);
  }
  return adj;
}
function normalizeMarket(priceA, priceB) {
  if (priceA == null || priceB == null) return null;
  if (!(priceA > 0 && priceA < 1 && priceB > 0 && priceB < 1)) return null;
  const s = priceA + priceB;
  if (s <= 0) return null;
  return { a: priceA / s, b: priceB / s };
}
function predict(input) {
  const emptyInputs = (partial = {}) => ({
    ratingA: null,
    ratingB: null,
    ratingKindA: "none",
    ratingKindB: "none",
    surface: input.surface,
    formAdjA: 0,
    formAdjB: 0,
    serveAdjA: 0,
    rankPullA: 0,
    rankPullB: 0,
    ...partial
  });
  const aBase = baseRating(input.playerA, input.surface);
  const bBase = baseRating(input.playerB, input.surface);
  if (!aBase || !bBase) {
    const mkt = normalizeMarket(input.priceA, input.priceB);
    const probA2 = mkt ? mkt.a : 0.5;
    return {
      probA: probA2,
      probB: 1 - probA2,
      confidence: "low",
      coverage: mkt ? "market" : "none",
      tieBreak: !mkt,
      inputs: emptyInputs()
    };
  }
  const priorA = input.playerA.rank != null ? rankPrior(input.playerA.rank) : null;
  const priorB = input.playerB.rank != null ? rankPrior(input.playerB.rank) : null;
  let rankPullA = 0;
  let rankPullB = 0;
  let ratingA = aBase.rating;
  let ratingB = bBase.rating;
  if (aBase.kind !== "rank-prior" && priorA != null) {
    rankPullA = clamp((priorA - aBase.rating) * RANK_PULL, -RANK_PULL_CAP, RANK_PULL_CAP);
    ratingA += rankPullA;
  }
  if (bBase.kind !== "rank-prior" && priorB != null) {
    rankPullB = clamp((priorB - bBase.rating) * RANK_PULL, -RANK_PULL_CAP, RANK_PULL_CAP);
    ratingB += rankPullB;
  }
  const formA = formAdj(input.playerA);
  const formB = formAdj(input.playerB);
  ratingA += formA;
  ratingB += formB;
  const serveA = serveDelta(input.playerA, input.playerB);
  ratingA += serveA;
  const probA = eloWinProb(ratingA, ratingB);
  const bothSurface = aBase.kind === "surface-elo" && bBase.kind === "surface-elo";
  const anyRankOnly = aBase.kind === "rank-prior" || bBase.kind === "rank-prior";
  const coverage = anyRankOnly ? aBase.kind === "rank-prior" && bBase.kind === "rank-prior" ? "rank" : "mixed" : "elo";
  const confidence = bothSurface ? "high" : "medium";
  return {
    probA,
    probB: 1 - probA,
    confidence,
    coverage,
    tieBreak: false,
    inputs: emptyInputs({
      ratingA,
      ratingB,
      ratingKindA: aBase.kind,
      ratingKindB: bBase.kind,
      formAdjA: formA,
      formAdjB: formB,
      serveAdjA: serveA,
      rankPullA,
      rankPullB
    })
  };
}
function isValue(modelProb, marketPrice) {
  if (marketPrice == null || !Number.isFinite(marketPrice)) return false;
  if (marketPrice >= VALUE_PRICE_CAP) return false;
  return modelProb - marketPrice >= VALUE_EDGE - 1e-12;
}
function draftPick(input) {
  if (!(input.startMs > input.nowMs)) return null;
  const pred = predict(input);
  let side;
  let tie = pred.tieBreak;
  if (pred.probA > pred.probB + 1e-12) side = "a";
  else if (pred.probB > pred.probA + 1e-12) side = "b";
  else {
    tie = true;
    const ra = input.playerA.rank;
    const rb = input.playerB.rank;
    if (ra != null && rb != null && ra !== rb) side = ra < rb ? "a" : "b";
    else if (input.priceA != null && input.priceB != null && input.priceA !== input.priceB) {
      side = input.priceA > input.priceB ? "a" : "b";
    } else side = "a";
  }
  const modelProb = side === "a" ? pred.probA : pred.probB;
  const marketPrice = side === "a" ? input.priceA : input.priceB;
  const edgePp = marketPrice == null ? null : (modelProb - marketPrice) * 100;
  return {
    pickedAt: new Date(input.nowMs).toISOString(),
    side,
    playerId: side === "a" ? input.playerAId : input.playerBId,
    playerName: side === "a" ? input.playerAName : input.playerBName,
    modelProb,
    marketPrice,
    edgePp,
    value: isValue(modelProb, marketPrice),
    confidence: tie ? "low" : pred.confidence,
    coverage: pred.coverage,
    inputsVersion: INPUTS_VERSION,
    inputs: pred.inputs
  };
}

// src/lib/tennis/names.ts
function foldName(name) {
  return name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/&amp;/g, " ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function compactName(name) {
  return foldName(name).replace(/ /g, "");
}
function playerId(name) {
  const id = foldName(name).replace(/ /g, "-");
  return id || "player";
}
function namesMatch(a, b) {
  const fa = foldName(a);
  const fb = foldName(b);
  if (!fa || !fb) return false;
  if (fa === fb) return true;
  if (compactName(a) === compactName(b)) return true;
  const ta = fa.split(" ");
  const tb = fb.split(" ");
  if (ta[ta.length - 1] !== tb[tb.length - 1]) return false;
  return ta[0] === tb[0];
}

// src/lib/tennis/countries.ts
var NAMES = {
  ar: "Argentina",
  at: "Austria",
  au: "Australia",
  be: "Belgium",
  bg: "Bulgaria",
  br: "Brazil",
  by: "Belarus",
  ca: "Canada",
  ch: "Switzerland",
  cl: "Chile",
  cn: "China",
  co: "Colombia",
  cr: "Costa Rica",
  cy: "Cyprus",
  cz: "Czechia",
  de: "Germany",
  dk: "Denmark",
  ec: "Ecuador",
  ee: "Estonia",
  eg: "Egypt",
  es: "Spain",
  fi: "Finland",
  fr: "France",
  gb: "Great Britain",
  ge: "Georgia",
  gr: "Greece",
  hk: "Hong Kong",
  hr: "Croatia",
  hu: "Hungary",
  id: "Indonesia",
  ie: "Ireland",
  il: "Israel",
  in: "India",
  it: "Italy",
  jp: "Japan",
  kr: "South Korea",
  kz: "Kazakhstan",
  lt: "Lithuania",
  lv: "Latvia",
  ma: "Morocco",
  mx: "Mexico",
  nl: "Netherlands",
  no: "Norway",
  nz: "New Zealand",
  pe: "Peru",
  pl: "Poland",
  pt: "Portugal",
  py: "Paraguay",
  ro: "Romania",
  rs: "Serbia",
  ru: "Russia",
  se: "Sweden",
  si: "Slovenia",
  sk: "Slovakia",
  th: "Thailand",
  tn: "Tunisia",
  tr: "Turkey",
  tw: "Taiwan",
  ua: "Ukraine",
  us: "United States",
  uy: "Uruguay",
  uz: "Uzbekistan",
  za: "South Africa"
};
var ISO3 = {
  arg: "ar",
  aus: "au",
  aut: "at",
  bel: "be",
  blr: "by",
  bra: "br",
  bul: "bg",
  can: "ca",
  chi: "cl",
  chn: "cn",
  col: "co",
  cro: "hr",
  cze: "cz",
  den: "dk",
  ecu: "ec",
  egy: "eg",
  esp: "es",
  est: "ee",
  fin: "fi",
  fra: "fr",
  gbr: "gb",
  geo: "ge",
  ger: "de",
  gre: "gr",
  hkg: "hk",
  hun: "hu",
  ina: "in",
  irl: "ie",
  isr: "il",
  ita: "it",
  jpn: "jp",
  kaz: "kz",
  kor: "kr",
  lat: "lv",
  ltu: "lt",
  mar: "ma",
  mex: "mx",
  ned: "nl",
  nor: "no",
  nzl: "nz",
  par: "py",
  per: "pe",
  pol: "pl",
  por: "pt",
  rou: "ro",
  rsa: "za",
  rus: "ru",
  srb: "rs",
  sui: "ch",
  svk: "sk",
  swe: "se",
  tha: "th",
  tpe: "tw",
  tun: "tn",
  tur: "tr",
  ukr: "ua",
  uru: "uy",
  usa: "us",
  uzb: "uz",
  slo: "si",
  cyp: "cy",
  crc: "cr"
};
function toIso2(code) {
  if (!code) return null;
  const c = code.toLowerCase();
  if (c === "un") return null;
  if (c.length === 2) return c;
  return ISO3[c] ?? null;
}
function countryName(code, fallback) {
  if (fallback) return fallback;
  const iso = toIso2(code);
  if (!iso) return null;
  return NAMES[iso] ?? iso.toUpperCase();
}

// src/lib/tennis/parse.ts
var IN_PLAY = /* @__PURE__ */ new Set(["S1", "S2", "S3", "S4", "S5", "LIVE"]);
function eventTour(ev) {
  const sport = typeof ev.sport === "string" ? ev.sport : ev.sport?.sport;
  if (sport === "atp" || sport === "wta" || sport === "itf") return sport;
  const slug = ev.slug ?? "";
  if (slug.startsWith("atp-")) return "atp";
  if (slug.startsWith("wta-")) return "wta";
  if (slug.startsWith("itf-")) return "itf";
  return null;
}
function isDoublesEvent(ev) {
  const sport = typeof ev.sport === "string" ? ev.sport : ev.sport?.sport || "";
  if (sport.includes("doubles")) return true;
  const blob = `${ev.slug ?? ""} ${ev.title ?? ""}`.toLowerCase();
  return blob.includes("doubles");
}
function parseJsonArray(raw) {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}
function parseNumArray(raw) {
  return parseJsonArray(raw).map((s) => Number(s)).map((n) => Number.isFinite(n) ? n : NaN);
}
function moneyline(ev) {
  const markets = ev.markets ?? [];
  return markets.find((m) => m.sportsMarketType === "moneyline") ?? null;
}
function outcomeMids(market) {
  const names = parseJsonArray(market.outcomes);
  const posted = parseNumArray(market.outcomePrices);
  const bid = typeof market.bestBid === "number" ? market.bestBid : null;
  const ask = typeof market.bestAsk === "number" ? market.bestAsk : null;
  if (names.length >= 2 && bid != null && ask != null && bid >= 0 && ask <= 1 && ask >= bid && ask - bid <= 0.2) {
    const mid = (bid + ask) / 2;
    return { names, prices: [clamp01(mid), clamp01(1 - mid)] };
  }
  const prices = names.map((_, i) => {
    const n = posted[i];
    return n != null && Number.isFinite(n) ? clamp01(n) : null;
  });
  return { names, prices };
}
function clamp01(n) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
function setComplete(a, b) {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi >= 6 && hi - lo >= 2) return true;
  if (hi === 7 && lo === 6) return true;
  return false;
}
function parseSets(score) {
  if (!score) return [];
  const parts = score.split(",").map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const part of parts) {
    const m = part.match(/(\d+)\s*[-–]\s*(\d+)(?:\s*\(([^)]+)\))?/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    out.push({ a, b, tiebreak: m[3] ?? null, complete: setComplete(a, b) });
  }
  return out;
}
function setsWon(sets, status) {
  const countable = status === "finished" ? sets.filter((s) => s.complete) : sets.filter((s) => s.complete);
  let a = 0;
  let b = 0;
  for (const s of countable) {
    if (s.a > s.b) a += 1;
    else if (s.b > s.a) b += 1;
  }
  return { a, b };
}
function classifyEvent(ev, nowMs) {
  const tour = eventTour(ev);
  if (!tour || isDoublesEvent(ev)) return "ignore";
  if (!moneyline(ev)) return "ignore";
  const start = ev.startTime ? Date.parse(ev.startTime) : NaN;
  if (!Number.isFinite(start)) return "ignore";
  const ageH = (nowMs - start) / 36e5;
  const period = (ev.period || "").toUpperCase();
  if (period === "FT") {
    if (ageH >= -1 && ageH < 30) return "finished";
    return "ignore";
  }
  if (period === "SUS") {
    if (ageH < 36 && ageH > -2) return "suspended";
    return "ignore";
  }
  if (IN_PLAY.has(period) || ev.live === true) {
    if (ageH < 30 && ageH > -3) return "live";
    return "ignore";
  }
  if (period === "POST" || period === "CANC" || period === "VOID") {
    if (ageH < 48 && ageH > -72) return "upcoming";
    return "ignore";
  }
  if (ageH < 0 && ageH > -24 * 10) return "upcoming";
  if (ageH >= 0 && ageH < 3) return "upcoming";
  return "ignore";
}
function tournamentFromTitle(title) {
  const idx = title.lastIndexOf(":");
  if (idx === -1) return { tournament: title.trim(), playersHint: title };
  return { tournament: title.slice(0, idx).trim(), playersHint: title.slice(idx + 1).trim() };
}
function itfLevel(title) {
  const m = title.match(/\b([MW]\d{2,3})\b/);
  return m ? m[1] : null;
}
function countryFromFlagUrl(url) {
  if (!url) return null;
  const m = url.match(/country-flags\/([a-z]{2})\.png/i) || url.match(/countries\/500\/([a-z]{2,3})\.png/i);
  if (!m) return null;
  const code = m[1].toLowerCase();
  if (code === "un") return null;
  return code;
}
function serverSide(ev, nameA, nameB) {
  const raw = (ev.server || ev.serving || "").trim();
  if (!raw) return null;
  const n = raw.toLowerCase();
  if (n === "home" || n === "a" || n === "0") return "a";
  if (n === "away" || n === "b" || n === "1") return "b";
  if (nameA && n.includes(nameA.toLowerCase())) return "a";
  if (nameB && n.includes(nameB.toLowerCase())) return "b";
  return null;
}
function volumeOf(market) {
  const n = typeof market.volume === "number" ? market.volume : Number(market.volume);
  return Number.isFinite(n) ? n : null;
}

// src/server/tennis/jobs.ts
async function loadReference() {
  try {
    const raw = await readFile(path.join(process.cwd(), "public/data/tennis/reference.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function fetchGamma() {
  const series = ["10365", "10366", "11634"];
  const all = [];
  for (const id of series) {
    for (let offset = 0; offset <= 2e3; offset += 100) {
      const url = `https://gamma-api.polymarket.com/events?series_id=${id}&closed=false&limit=100&offset=${offset}`;
      const res = await fetch(url, { headers: { Accept: "application/json", "Accept-Encoding": "gzip", "User-Agent": "PolyverseTennis/0.1" } });
      if (!res.ok) throw new Error(`gamma ${res.status}`);
      const batch = await res.json();
      if (!Array.isArray(batch) || !batch.length) break;
      all.push(...batch);
      if (batch.length < 100) break;
    }
  }
  return all;
}
function findName(rows, name) {
  const compact = compactName(name);
  const hit = rows.find((r) => compactName(r.name) === compact);
  if (hit) return hit;
  const loose = rows.filter((r) => namesMatch(r.name, name));
  return loose.length === 1 ? loose[0] : null;
}
function tierFor(tour, tournament, title, files) {
  if (tour === "itf") return { tier: "itf", level: itfLevel(title) };
  const blob = `${tournament} ${title}`.toLowerCase();
  if (blob.includes("challenger")) return { tier: "challenger", level: null };
  let best = null;
  for (const f of files) {
    const city = f.city.toLowerCase();
    if (city.length >= 4 && blob.includes(city) && (!best || f.city.length > best.city.length)) best = f;
  }
  if (best) return { tier: best.tier, level: best.level };
  if (tour === "wta") return { tier: "wta", level: null };
  if (/finals/i.test(blob)) return { tier: "atp", level: "Finals" };
  return { tier: "atp", level: null };
}
function playerOf(name, logo, elo, rank) {
  const countryCode = toIso2(rank?.countryCode || countryFromFlagUrl(logo));
  return {
    id: playerId(name),
    name,
    countryCode,
    countryName: rank?.countryName || countryName(countryCode),
    flagUrl: rank?.flagUrl || (countryCode && logo && !logo.includes("/un.png") ? logo : null),
    rank: rank?.rank ?? null,
    rankTour: rank ? rank.tour === "wta" ? "WTA" : "ATP" : null,
    rankSource: rank ? `ESPN ${rank.tour.toUpperCase()} rankings${rank.asOf ? ` ${rank.asOf}` : ""}` : null,
    elo: elo?.elo ?? null,
    hElo: elo?.hElo ?? null,
    cElo: elo?.cElo ?? null,
    gElo: elo?.gElo ?? null,
    eloSource: elo ? `Tennis Abstract ${elo.tour.toUpperCase()} Elo${elo.updated ? `, updated ${elo.updated}` : ""}` : null,
    photo: null,
    form: null,
    serve: null,
    recentH2h: null
  };
}
function toMatch(ev, now, ref) {
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
  const priceFor = (name) => {
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
    result: null
  };
}
async function upsertMatch(db, match) {
  await db.query(
    `INSERT INTO tennis_matches (id, start_time, status, payload, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, payload = EXCLUDED.payload, start_time = EXCLUDED.start_time, updated_at = now()`,
    [match.id, match.startTime, match.status, JSON.stringify({ ...match, pick: null, result: null })]
  );
}
async function insertPickIfEligible(db, match, now) {
  const existing = await db.query(`SELECT payload FROM tennis_picks WHERE match_id = $1`, [match.id]);
  if (existing.rows[0]?.payload) return existing.rows[0].payload;
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
    playerBName: match.playerB.name
  });
  if (!pick) return null;
  const inserted = await db.query(
    `INSERT INTO tennis_picks (match_id, picked_at, payload)
     SELECT m.id, $2, $3::jsonb FROM tennis_matches m
     WHERE m.id = $1 AND m.start_time > now()
     ON CONFLICT (match_id) DO NOTHING
     RETURNING payload`,
    [match.id, pick.pickedAt, JSON.stringify(pick)]
  );
  if (inserted.rows[0]?.payload) return inserted.rows[0].payload;
  const again = await db.query(`SELECT payload FROM tennis_picks WHERE match_id = $1`, [match.id]);
  return again.rows[0]?.payload ?? null;
}
async function settle(db, match, pick, nowIso) {
  const have = await db.query(`SELECT payload FROM tennis_results WHERE match_id = $1`, [match.id]);
  if (have.rows[0]?.payload) return have.rows[0].payload;
  if (!pick) return null;
  const resolution = resolutionFromPrices(match.priceA, match.priceB, match.marketClosed, "polymarket moneyline");
  const graded = gradePick(pick, resolution, nowIso);
  if (!graded) return null;
  await db.query(
    `INSERT INTO tennis_results (match_id, settled_at, payload)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (match_id) DO NOTHING`,
    [match.id, graded.settledAt, JSON.stringify(graded)]
  );
  return graded;
}
async function runJob(job) {
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
    let pick = null;
    if (job === "picks" || job === "all" || job === "settle") {
      const before = await db.query(`SELECT payload FROM tennis_picks WHERE match_id = $1`, [match.id]);
      pick = before.rows[0]?.payload ? before.rows[0].payload : null;
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
    note: "Serve and recent-form adjustments are applied on the snapshot build. Cron picks use Elo and rank from reference.json and do not rewrite an existing pick."
  };
}

// src/server/tennis/cron.ts
async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!cronAuthorized(req.headers?.authorization)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const raw = req.query?.job;
  const job = (Array.isArray(raw) ? raw[0] : raw) || "all";
  if (job !== "ingest" && job !== "picks" && job !== "settle" && job !== "all") {
    return res.status(400).json({ error: "job must be ingest, picks, settle, or all" });
  }
  try {
    return res.status(200).json(await runJob(job));
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "cron failed" });
  }
}
export {
  handler as default
};
