#!/usr/bin/env node
/**
 * Smoke tests for /lolesports: formulas, search, tiers, no-data honesty.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const pub = join(root, "public/lolesports");

function loadJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

// --- grade formula (inline mirror of grades.ts) ---
const GRADE_THRESHOLDS = { S: 0.9, A: 0.75, B: 0.55, C: 0.35, D: 0.15, F: 0 };
function gradeFromPercentile(p) {
  if (p == null || Number.isNaN(p)) return null;
  if (p >= GRADE_THRESHOLDS.S) return "S";
  if (p >= GRADE_THRESHOLDS.A) return "A";
  if (p >= GRADE_THRESHOLDS.B) return "B";
  if (p >= GRADE_THRESHOLDS.C) return "C";
  if (p >= GRADE_THRESHOLDS.D) return "D";
  return "F";
}
function shrinkTowardMean(obs, n, peerMean, k = 8) {
  if (obs == null || Number.isNaN(obs)) return null;
  if (peerMean == null || Number.isNaN(peerMean)) return obs;
  const w = n / (n + k);
  return w * obs + (1 - w) * peerMean;
}

assert.equal(gradeFromPercentile(0.95), "S");
assert.equal(gradeFromPercentile(0.8), "A");
assert.equal(gradeFromPercentile(0.6), "B");
assert.equal(gradeFromPercentile(0.4), "C");
assert.equal(gradeFromPercentile(0.2), "D");
assert.equal(gradeFromPercentile(0.05), "F");
assert.equal(gradeFromPercentile(null), null);

const shrunk = shrinkTowardMean(10, 8, 0, 8);
assert.ok(Math.abs(shrunk - 5) < 1e-9);

// --- search (inline mirror) ---
function normalizeQuery(q) {
  return q.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function compact(q) {
  return normalizeQuery(q).replace(/\s+/g, "");
}
function searchTeams(teams, query, tier = "all", limit = 25) {
  const filtered = tier === "all" ? teams : teams.filter((t) => t.tier === tier);
  const nq = normalizeQuery(query);
  if (!nq) return filtered.slice(0, limit);
  const cq = compact(query);
  const scored = [];
  for (const t of filtered) {
    const nameN = normalizeQuery(t.name);
    const nameC = compact(t.name);
    const aliasN = t.aliases.map(normalizeQuery);
    const aliasC = t.aliases.map(compact);
    let score = 0;
    if (nameN === nq || aliasN.includes(nq) || nameC === cq || aliasC.includes(cq)) score = 100;
    else if (nameN.startsWith(nq) || aliasN.some((a) => a.startsWith(nq))) score = 80;
    else if (nameC.startsWith(cq) || aliasC.some((a) => a.startsWith(cq))) score = 75;
    else if (nameN.includes(nq) || aliasN.some((a) => a.includes(nq))) score = 60;
    else if (nameC.includes(cq) || aliasC.some((a) => a.includes(cq))) score = 55;
    if (score >= 75) {
      const isFarm = /challengers|academy/i.test(t.name) || t.tier === "academy_erl";
      if (isFarm && cq.length <= 3 && !/challenger|academy|cl/.test(nq)) score -= 15;
    }
    if (score > 0) scored.push({ t, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.t);
}

// --- artifacts present ---
assert.ok(existsSync(join(pub, "index.json")), "index.json missing");
assert.ok(existsSync(join(pub, "methodology.json")), "methodology.json missing");
assert.ok(existsSync(join(pub, "meta.json")), "meta.json missing");

const index = loadJson(join(pub, "index.json"));
const method = loadJson(join(pub, "methodology.json"));
assert.equal(method.scoring_version, index.meta.scoring_version);
assert.ok(index.teams.length > 50, "expected many teams");
assert.equal(index.meta.coverage.honest_cutoff, true);
assert.ok(String(index.meta.coverage.detailed_stats_through || "").startsWith("2026-10-24"), "OE detail cutoff");
assert.ok(String(index.meta.coverage.match_results_through || index.meta.coverage.end) >= "2026-11-05", "match results should reach Nov 5 gol.gg");
assert.notEqual(index.meta.coverage.detailed_stats_through, index.meta.coverage.match_results_through, "dual cutoffs must differ while OE lags");

const majors = index.teams.filter((t) => t.tier === "majors");
const academy = index.teams.filter((t) => t.tier === "academy_erl");
assert.ok(majors.length > 0 && academy.length > 0, "both tiers required");

const dkMain = index.teams.find((t) => t.id === "dplus-kia-lck");
const dkCh = index.teams.find((t) => t.id === "dplus-kia-challengers-lckc");
const dkAc = index.teams.find((t) => t.id === "dplus-kia-academy-las");
assert.ok(dkMain, "Dplus Kia LCK present");
assert.ok(dkCh, "Dplus Kia Challengers distinct");
assert.ok(dkAc, "Dplus Kia Academy distinct");
assert.notEqual(dkMain.id, dkCh.id);
assert.equal(dkMain.tier, "majors");
assert.equal(dkCh.tier, "academy_erl");

const dkHits = searchTeams(index.teams, "DK", "all", 10);
assert.ok(dkHits.length >= 1, "DK search hits");
assert.equal(dkHits[0].id, "dplus-kia-lck", "short alias prefers main LCK org");

const chHits = searchTeams(index.teams, "Dplus Kia Challengers", "all", 5);
assert.ok(chHits.some((t) => t.id === "dplus-kia-challengers-lckc"));

const majOnly = searchTeams(index.teams, "Dplus", "majors", 20);
assert.ok(majOnly.every((t) => t.tier === "majors"));
assert.ok(!majOnly.some((t) => /challengers|academy/i.test(t.name)));

// --- team card honesty ---
const card = loadJson(join(pub, "teams", `${dkMain.id}.json`));
assert.equal(card.name, "Dplus Kia");
assert.ok(card.kpis.record.games >= 8);
assert.ok(card.roster.length === 5, "five roles");
assert.ok(card.side_pick_order.rows.All);
assert.ok(card.drafting.season_proxy.label === "draft_proxy");
assert.ok(/not causal|NOT causal|proxy/i.test(card.drafting.analysis));
assert.ok(Array.isArray(card.gaps));
// missing must not be silently zeroed for GD when present — mean can be number
assert.equal(typeof card.kpis.golddiffat15.mean, "number");
assert.ok(/Oracle|OE/i.test(card.provenance.source));
assert.ok(card.window.detailed_stats_through);
assert.ok(card.window.match_results_through);
assert.ok(card.gaps.some((g) => /post-OE|detailed/i.test(g)), "expect honest post-OE gap");
// BLG 3-0 DK QF should move DK Worlds losses via gol.gg thin maps
const intl = card.kpis.international.by_event || [];
const worlds = intl.find((e) => /world/i.test(e.league));
assert.ok(worlds, "DK should have Worlds/intl event rows");
assert.ok(worlds.l >= 3, "DK should include QF map losses vs BLG (gol.gg)");

// no-data path: invent missing team file check
assert.equal(existsSync(join(pub, "teams", "definitely-not-a-team.json")), false);

// methodology thresholds match client
assert.deepEqual(method.grade_thresholds, {
  S: 0.9,
  A: 0.75,
  B: 0.55,
  C: 0.35,
  D: 0.15,
  F: 0,
});

console.log("lolesports smoke OK", {
  teams: index.teams.length,
  majors: majors.length,
  academy: academy.length,
  cutoff: index.meta.coverage.end,
  dk: dkMain.id,
});
