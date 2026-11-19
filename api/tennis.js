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

// src/lib/tennis/methodology.ts
var INPUTS_VERSION = "polyverse-tennis-v1";
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
var SKILL_RANK_RATIO = 0.5;
var SKILL_MIN_RANK_GAP = 50;
var SKILL_MIN_ELO_GAP = 150;
var SKILL_MIN_SAMPLE = 5;
var SKILL_FORM_GAP = 0.2;
var SKILL_SERVE_WON_GAP = 8;
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
    heading: "Skill gap",
    body: [
      "Skill gap is separate from VALUE. A match can be both, either, or neither. It is not a pick by itself, and it is omitted when either player is missing the numbers for a criterion.",
      `Placement: the better rank is at most ${SKILL_RANK_RATIO * 100}% of the other and at least ${SKILL_MIN_RANK_GAP} places better, or the Elo gap is at least ${SKILL_MIN_ELO_GAP} (surface Elo when both have the known surface, otherwise overall Elo). If rank and Elo name different players, there is no placement side.`,
      `Results: with at least ${SKILL_MIN_SAMPLE} recent matches each, the better win rate is at least ${SKILL_FORM_GAP * 100} percentage points higher. If either sample is shorter than that, 1st-serve points won can be used instead when both samples have at least ${SKILL_MIN_SAMPLE} matches and the gap is at least ${SKILL_SERVE_WON_GAP} percentage points.`,
      "The same player has to be ahead on placement and on results. The badge tooltip lists the figures, for example \u201C#42 vs #310, form 8\u20132 vs 3\u20137\u201D.",
      "The record\u2019s skill-gap line counts only settled picks on matches that meet this test. Until some of those matches settle, that line stays blank."
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

// src/lib/tennis/skillGap.ts
function placementSide(a, b, surface) {
  let rankSide = null;
  let rankNote = "";
  if (a.rank != null && b.rank != null && a.rank !== b.rank) {
    const side2 = a.rank < b.rank ? "a" : "b";
    const better = side2 === "a" ? a.rank : b.rank;
    const worse = side2 === "a" ? b.rank : a.rank;
    if (better <= worse * SKILL_RANK_RATIO && worse - better >= SKILL_MIN_RANK_GAP) {
      rankSide = side2;
      rankNote = `#${better} vs #${worse}`;
    }
  }
  const elo = (p) => {
    if (surface === "Hard" && p.hElo != null) return p.hElo;
    if (surface === "Clay" && p.cElo != null) return p.cElo;
    if (surface === "Grass" && p.gElo != null) return p.gElo;
    return p.elo;
  };
  const ea = elo(a);
  const eb = elo(b);
  let eloSide = null;
  let eloNote = "";
  if (ea != null && eb != null && Math.abs(ea - eb) >= SKILL_MIN_ELO_GAP) {
    eloSide = ea > eb ? "a" : "b";
    const label = surface === "Hard" && a.hElo != null && b.hElo != null ? "hard Elo" : surface === "Clay" && a.cElo != null && b.cElo != null ? "clay Elo" : surface === "Grass" && a.gElo != null && b.gElo != null ? "grass Elo" : "Elo";
    const hi = eloSide === "a" ? ea : eb;
    const lo = eloSide === "a" ? eb : ea;
    eloNote = `${label} ${Math.round(hi)} vs ${Math.round(lo)}`;
  }
  if (rankSide && eloSide && rankSide !== eloSide) return null;
  const side = rankSide ?? eloSide;
  if (!side) return null;
  return { side, note: [rankNote, eloNote].filter(Boolean).join(", ") };
}
function resultsSide(a, b) {
  const af = a.form;
  const bf = b.form;
  if (af && bf && af.n >= SKILL_MIN_SAMPLE && bf.n >= SKILL_MIN_SAMPLE) {
    const aw = af.w / af.n;
    const bw = bf.w / bf.n;
    if (Math.abs(aw - bw) < SKILL_FORM_GAP) return null;
    const side = aw > bw ? "a" : "b";
    const bwins = side === "a" ? af : bf;
    const lwins = side === "a" ? bf : af;
    return { side, note: `form ${bwins.w}\u2013${bwins.l} vs ${lwins.w}\u2013${lwins.l}` };
  }
  const as = a.serve;
  const bs = b.serve;
  if (as && bs && as.sample >= SKILL_MIN_SAMPLE && bs.sample >= SKILL_MIN_SAMPLE && as.firstWonPct != null && bs.firstWonPct != null && Math.abs(as.firstWonPct - bs.firstWonPct) >= SKILL_SERVE_WON_GAP) {
    const side = as.firstWonPct > bs.firstWonPct ? "a" : "b";
    const hi = side === "a" ? as.firstWonPct : bs.firstWonPct;
    const lo = side === "a" ? bs.firstWonPct : as.firstWonPct;
    return {
      side,
      note: `1st serve won ${hi.toFixed(0)}% vs ${lo.toFixed(0)}%`
    };
  }
  return null;
}
function skillGap(match) {
  const place = placementSide(match.playerA, match.playerB, match.surface);
  const results = resultsSide(match.playerA, match.playerB);
  if (!place || !results || place.side !== results.side) return null;
  const player = place.side === "a" ? match.playerA : match.playerB;
  return {
    side: place.side,
    playerName: player.name,
    note: [place.note, results.note].filter(Boolean).join(", ")
  };
}

// src/lib/tennis/grade.ts
function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((s, n) => s + n, 0) / xs.length;
}
function summarize(matches) {
  let wins = 0;
  let losses = 0;
  let voids = 0;
  let pending = 0;
  let valueWins = 0;
  let valueLosses = 0;
  let skillGapWins = 0;
  let skillGapLosses = 0;
  let skillGapPending = 0;
  const pnls = [];
  const skillPnls = [];
  const briers = [];
  const logs = [];
  for (const m of matches) {
    if (!m.pick) continue;
    const gap = skillGap(m);
    if (!m.result) {
      if (m.status === "upcoming" || m.status === "live" || m.status === "suspended") pending += 1;
      if (gap && (m.status === "upcoming" || m.status === "live")) skillGapPending += 1;
      continue;
    }
    if (m.result.kind === "void") {
      voids += 1;
      continue;
    }
    if (m.result.pickWon) {
      wins += 1;
      if (m.pick.value) valueWins += 1;
      if (gap) skillGapWins += 1;
    } else if (m.result.pickWon === false) {
      losses += 1;
      if (m.pick.value) valueLosses += 1;
      if (gap) skillGapLosses += 1;
    }
    if (m.result.pnlFlat1u != null) {
      pnls.push(m.result.pnlFlat1u);
      if (gap) skillPnls.push(m.result.pnlFlat1u);
    }
    if (m.result.brier != null) briers.push(m.result.brier);
    if (m.result.logLoss != null) logs.push(m.result.logLoss);
  }
  const settled = wins + losses;
  return {
    settled,
    wins,
    losses,
    voids,
    pending,
    winRate: settled ? wins / settled : null,
    valueWins,
    valueLosses,
    valueSettled: valueWins + valueLosses,
    skillGapWins,
    skillGapLosses,
    skillGapSettled: skillGapWins + skillGapLosses,
    skillGapWinRate: skillGapWins + skillGapLosses ? skillGapWins / (skillGapWins + skillGapLosses) : null,
    skillGapRoi: skillPnls.length ? skillPnls.reduce((s, n) => s + n, 0) / skillPnls.length : null,
    skillGapPending,
    roi: pnls.length ? pnls.reduce((s, n) => s + n, 0) / pnls.length : null,
    brier: mean(briers),
    logLoss: mean(logs),
    stake: "flat 1u at the pick-time price"
  };
}
function sliceOf(key, rows) {
  const wins = rows.filter((r) => r.won).length;
  const losses = rows.length - wins;
  const pnls = rows.map((r) => r.pnl).filter((n) => n != null);
  const briers = rows.map((r) => r.brier).filter((n) => n != null);
  return {
    key,
    settled: rows.length,
    wins,
    losses,
    winRate: rows.length ? wins / rows.length : null,
    roi: pnls.length ? pnls.reduce((s, n) => s + n, 0) / pnls.length : null,
    brier: mean(briers)
  };
}
function groupSlices(matches, keyFn) {
  const groups = /* @__PURE__ */ new Map();
  for (const m of matches) {
    if (!m.pick || !m.result || m.result.kind !== "winner" || m.result.pickWon == null) continue;
    const key = keyFn(m);
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push({ won: m.result.pickWon, pnl: m.result.pnlFlat1u, brier: m.result.brier });
    groups.set(key, arr);
  }
  return [...groups.entries()].map(([key, rows]) => sliceOf(key, rows)).sort((a, b) => a.key.localeCompare(b.key));
}
function calibration(matches, bins = 5) {
  const width = 1 / bins;
  const out = [];
  for (let i = 0; i < bins; i++) {
    const from = i * width;
    const to = (i + 1) * width;
    const rows = matches.filter((m) => {
      if (!m.pick || !m.result || m.result.kind !== "winner" || m.result.pickWon == null) return false;
      const p = m.pick.modelProb;
      return i === bins - 1 ? p >= from && p <= to : p >= from && p < to;
    });
    out.push({
      from,
      to,
      n: rows.length,
      meanProb: rows.length ? rows.reduce((s, m) => s + m.pick.modelProb, 0) / rows.length : null,
      freq: rows.length ? rows.filter((m) => m.result.pickWon).length / rows.length : null
    });
  }
  return out;
}
function buildRecord(matches, generatedAt, inputsVersion) {
  const pending = matches.filter((m) => m.pick && !m.result).map(toPickRow);
  const settled = matches.filter((m) => m.pick && m.result).map(toPickRow);
  return {
    generatedAt,
    inputsVersion,
    totals: summarize(matches),
    byTier: groupSlices(matches, (m) => m.tier),
    bySurface: groupSlices(matches, (m) => m.surface),
    calibration: calibration(matches),
    pending,
    settled
  };
}
function toPickRow(m) {
  return {
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
    status: m.status
  };
}

// src/server/tennis/jobs.ts
async function readBoard(db) {
  await ensureSchema(db);
  const matches = await hydrate(db);
  return {
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    inputsVersion: INPUTS_VERSION,
    source: "postgres",
    matches,
    record: summarize(matches),
    sources: { markets: "polymarket gamma", storage: "DATABASE_URL" },
    notes: [
      "Live board from Postgres. Picks are the rows written before start and are not recomputed.",
      "Photos and serve samples are on the static snapshot. This view leaves them blank when the database row does not carry them."
    ]
  };
}
async function readRecord(db) {
  await ensureSchema(db);
  const matches = await hydrate(db);
  return { ...buildRecord(matches, (/* @__PURE__ */ new Date()).toISOString(), INPUTS_VERSION), source: "postgres" };
}
async function hydrate(db) {
  const res = await db.query(
    `SELECT m.payload AS match, p.payload AS pick, r.payload AS result
     FROM tennis_matches m
     LEFT JOIN tennis_picks p ON p.match_id = m.id
     LEFT JOIN tennis_results r ON r.match_id = m.id
     ORDER BY m.start_time ASC`
  );
  return res.rows.map((row) => {
    const match = row.match;
    match.pick = row.pick ?? null;
    match.result = row.result ?? null;
    return match;
  });
}
async function readPlayer(db, id) {
  const matches = await hydrate(db);
  const hits = matches.filter((m) => m.playerA.id === id || m.playerB.id === id);
  if (!hits.length) return null;
  const player = hits[0].playerA.id === id ? hits[0].playerA : hits[0].playerB;
  const record = buildRecord(hits, (/* @__PURE__ */ new Date()).toISOString(), INPUTS_VERSION);
  return {
    source: "postgres",
    player,
    recent: [],
    picks: [...record.pending, ...record.settled],
    generatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}

// src/server/tennis/http.ts
function q(req, key) {
  const v = req.query?.[key];
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}
async function handler(req, res) {
  const db = await getDb();
  if (!db) {
    return res.status(200).json({
      source: "unconfigured",
      matches: [],
      notes: ["DATABASE_URL is not set. The page uses the committed snapshot when that file is present."]
    });
  }
  const view = q(req, "view") || "board";
  try {
    if (view === "record") return res.status(200).json(await readRecord(db));
    if (view === "player") {
      const id = q(req, "id");
      const player = await readPlayer(db, id);
      if (!player) return res.status(404).json({ source: "postgres", error: "player not in the book" });
      return res.status(200).json(player);
    }
    return res.status(200).json(await readBoard(db));
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : "tennis read failed" });
  }
}
export {
  handler as default
};
