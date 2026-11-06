/**
 * Live smoke + schema lock for pm-explorer adapters.
 * Run: node scripts/pm-explorer-smoke.mjs
 * Requires network. No secrets.
 */
import assert from "node:assert/strict";

const GAMMA = "https://gamma-api.polymarket.com";
const CLOB = "https://clob.polymarket.com";
const DATA = "https://data-api.polymarket.com";

async function get(url) {
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "polyverse-smoke" } });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

function assertGammaEvent(ev) {
  assert.ok(ev.id && ev.slug && ev.title, "event id/slug/title");
}
function assertGammaMarket(m) {
  assert.ok(m.id && m.conditionId && m.clobTokenIds && m.outcomes, "market fields");
}
function assertTradesV2(payload) {
  assert.ok(Array.isArray(payload.data), "trades.data array");
  if (payload.data[0]) {
    const r = payload.data[0];
    for (const k of ["proxy_wallet", "side", "token_id", "price", "size", "timestamp"]) {
      assert.ok(r[k] != null, `trade.${k}`);
    }
  }
  assert.equal(typeof payload.pagination?.has_more, "boolean");
}

// Inline SSRF parse (mirrors urlParse / api)
function parse(rawInput) {
  const raw = String(rawInput || "").trim();
  const ALLOWED = new Set(["polymarket.com", "www.polymarket.com"]);
  if (!raw) return { ok: false, code: "empty" };
  if (/^https?:\/\//i.test(raw) || raw.startsWith("polymarket.com") || raw.startsWith("www.polymarket.com")) {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!ALLOWED.has(url.hostname.toLowerCase())) return { ok: false, code: "disallowed_host" };
    const parts = url.pathname.replace(/\/+/g, "/").split("/").filter(Boolean);
    if (parts[0] === "event" && parts[1]) return { ok: true, eventSlug: parts[1], marketSlug: parts[2] };
    return { ok: false, code: "unsupported" };
  }
  return { ok: true, kind: "keyword" };
}

const results = [];
function pass(name) { results.push(["PASS", name]); console.log("PASS", name); }
function fail(name, e) { results.push(["FAIL", name, String(e)]); console.error("FAIL", name, e); }

try {
  assert.equal(parse("https://evil.example/event/x").ok, false);
  assert.equal(parse("https://evil.example/event/x").code, "disallowed_host");
  assert.equal(parse("http://127.0.0.1/event/x").ok, false);
  assert.equal(parse("https://polymarket.com/event/lol-kc-t1-2026-11-04").ok, true);
  assert.equal(parse("https://polymarket.com/event/lol-kc-t1-2026-11-04").eventSlug, "lol-kc-t1-2026-11-04");
  pass("SSRF allowlist + event URL parse");
} catch (e) { fail("SSRF allowlist + event URL parse", e); }

try {
  const { status, json } = await get(`${GAMMA}/public-search?q=bitcoin&limit_per_type=2`);
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.events) && json.events.length);
  assertGammaEvent(json.events[0]);
  pass("gamma public-search schema");
} catch (e) { fail("gamma public-search schema", e); }

let conditionId, tokenId;
try {
  const { status, json } = await get(`${GAMMA}/events?slug=lol-kc-t1-2026-11-04`);
  assert.equal(status, 200);
  assert.ok(Array.isArray(json) && json[0]);
  assertGammaEvent(json[0]);
  assert.ok(Array.isArray(json[0].markets) && json[0].markets.length);
  assertGammaMarket(json[0].markets[0]);
  conditionId = json[0].markets[0].conditionId;
  const tokens = JSON.parse(json[0].markets[0].clobTokenIds);
  tokenId = tokens[0];
  pass("gamma events?slug schema + LoL preset event");
} catch (e) { fail("gamma events?slug schema + LoL preset event", e); }

try {
  assert.ok(tokenId);
  const { status, json } = await get(`${CLOB}/prices-history?market=${tokenId}&interval=1d&fidelity=60`);
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.history));
  if (json.history[0]) {
    assert.equal(typeof json.history[0].t, "number");
    assert.equal(typeof json.history[0].p, "number");
  }
  pass("clob prices-history schema");
} catch (e) { fail("clob prices-history schema", e); }

try {
  assert.ok(tokenId);
  const { status, json } = await get(`${CLOB}/book?token_id=${tokenId}`);
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.bids) && Array.isArray(json.asks));
  pass("clob book schema");
} catch (e) { fail("clob book schema", e); }

try {
  assert.ok(conditionId);
  const { status, json } = await get(`${DATA}/v2/trades?condition=${conditionId}&limit=5`);
  assert.equal(status, 200);
  assertTradesV2(json);
  pass("data-api v2 trades schema");
} catch (e) { fail("data-api v2 trades schema", e); }

try {
  const { status } = await get(`${DATA}/trades?limit=1`);
  assert.equal(status, 410, "v1 must stay retired");
  pass("data-api v1 still 410 (adapter must stay on v2)");
} catch (e) { fail("data-api v1 still 410 (adapter must stay on v2)", e); }

const failed = results.filter((r) => r[0] === "FAIL");
console.log("\nSummary:", results.length - failed.length, "passed,", failed.length, "failed");
process.exit(failed.length ? 1 : 0);
