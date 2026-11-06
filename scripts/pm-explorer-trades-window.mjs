/**
 * Tests for windowed trade pagination (no hard 800 cap).
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const helper = `
import {
  getTradesForWindow,
  intervalWindowStartMs,
  mapTrade,
  tradeMs,
} from "./src/lib/pm-explorer/adapters/dataTradesV2.ts";
import type { RawTradeV2 } from "./src/lib/pm-explorer/adapters/dataTradesV2.ts";

function pass(n: string) { console.log("PASS", n); }
function fail(n: string, e: unknown) { console.error("FAIL", n, e); process.exitCode = 1; }

function mkRaw(i: number, tsSec: number, notional = 100): RawTradeV2 {
  const price = 0.5;
  const size = notional / price;
  return {
    proxy_wallet: "0x" + String(i).padStart(40, "0"),
    side: i % 2 ? "SELL" : "BUY",
    token_id: "tok-a",
    size,
    price,
    timestamp: tsSec,
    transaction_hash: "0x" + i.toString(16).padStart(64, "a"),
    name: "w" + i,
    outcome: "T1",
  };
}

function installFakeFetch(total: number, baseTsSec: number) {
  const rows: RawTradeV2[] = [];
  for (let i = 0; i < total; i++) {
    rows.push(mkRaw(i, baseTsSec - i * 60, i === 5 ? 15000 : 50));
  }
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    const u = new URL(url, "http://local");
    const limit = Number(u.searchParams.get("limit") || 100);
    const cursor = u.searchParams.get("cursor");
    let offset = 0;
    if (cursor) offset = Number(Buffer.from(cursor, "base64").toString("utf8"));
    const slice = rows.slice(offset, offset + limit);
    const nextOffset = offset + slice.length;
    const has_more = nextOffset < rows.length;
    return new Response(
      JSON.stringify({
        data: slice,
        pagination: {
          has_more,
          next_cursor: has_more ? Buffer.from(String(nextOffset), "utf8").toString("base64") : undefined,
          limit,
          offset,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as any;
  return () => { globalThis.fetch = original; };
}

async function main() {
  try {
    const now = Date.parse("2026-11-06T12:00:00.000Z");
    if (intervalWindowStartMs("1w", now) !== now - 7 * 86400000) throw new Error("1w");
    if (intervalWindowStartMs("max", now) !== null) throw new Error("max");
    pass("intervalWindowStartMs mapping");
  } catch (e) { fail("intervalWindowStartMs mapping", e); }

  try {
    const restore = installFakeFetch(1200, Math.floor(Date.parse("2026-11-06T12:00:00.000Z") / 1000));
    const progresses: number[] = [];
    const wide = await getTradesForWindow("cond", {
      windowStartMs: null,
      windowEndMs: Date.parse("2026-11-06T12:00:00.000Z"),
      safetyCeiling: 20,
      onProgress: (p) => progresses.push(p.trades.length),
    });
    restore();
    if (wide.trades.length !== 1200) throw new Error("expected full 1200, got " + wide.trades.length);
    if (wide.meta.status !== "complete") throw new Error("status " + wide.meta.status);
    if (wide.meta.exhaustedApi !== true) throw new Error("exhausted");
    if (!progresses.length) throw new Error("no progressive callbacks");
    if (!(progresses[progresses.length - 1]! > 800)) throw new Error("progress never exceeded 800");
    pass(">800 load when window/API allows (no hard 800 cap)");
  } catch (e) { fail(">800 load when window/API allows (no hard 800 cap)", e); }

  try {
    const base = Math.floor(Date.parse("2026-11-06T12:00:00.000Z") / 1000);
    const restore = installFakeFetch(500, base);
    const start = Date.parse("2026-11-06T11:50:00.000Z");
    const { trades, meta } = await getTradesForWindow("cond", {
      windowStartMs: start,
      windowEndMs: Date.parse("2026-11-06T12:00:00.000Z"),
      safetyCeiling: 50,
    });
    restore();
    if (trades.length < 9 || trades.length > 12) throw new Error("boundary count " + trades.length);
    if (!meta.reachedWindowStart) throw new Error("expected reachedWindowStart");
    for (const t of trades) {
      if (tradeMs(t) < start) throw new Error("leaked older trade");
    }
    pass("time-start boundary stops pagination");
  } catch (e) { fail("time-start boundary stops pagination", e); }

  try {
    const a = mapTrade(mkRaw(1, 1000, 100))!;
    const b = mapTrade(mkRaw(1, 1000, 100))!;
    if (a.id !== b.id) throw new Error("stable id");
    const restore = installFakeFetch(50, 1_700_000_000);
    const { trades } = await getTradesForWindow("cond", {
      windowStartMs: null,
      windowEndMs: 1_700_000_000_000 + 60_000,
      safetyCeiling: 5,
    });
    restore();
    const ids = new Set(trades.map((t) => t.id));
    if (ids.size !== trades.length) throw new Error("dupes");
    pass("stable dedupe by trade id");
  } catch (e) { fail("stable dedupe by trade id", e); }

  try {
    const end = Date.parse("2026-11-06T12:00:00.000Z");
    const restore = installFakeFetch(250, Math.floor(end / 1000));
    const { trades, meta } = await getTradesForWindow("cond", {
      windowStartMs: null,
      windowEndMs: end,
      safetyCeiling: 2,
    });
    restore();
    if (trades.length !== 200) throw new Error("ceiling size " + trades.length);
    if (!meta.hitSafetyCeiling) throw new Error("expected ceiling flag");
    if (meta.status !== "partial") throw new Error("expected partial");
    pass("safety ceiling → partial (not claimed complete)");
  } catch (e) { fail("safety ceiling → partial (not claimed complete)", e); }

  try {
    const ac = new AbortController();
    ac.abort();
    let threw = false;
    try { await getTradesForWindow("cond", { windowStartMs: null, signal: ac.signal }); }
    catch (e) { threw = (e as Error).name === "AbortError"; }
    if (!threw) throw new Error("expected AbortError");
    pass("abort signal cancels fetch");
  } catch (e) { fail("abort signal cancels fetch", e); }

  try {
    const end = Date.parse("2026-11-06T12:00:00.000Z");
    const restore = installFakeFetch(950, Math.floor(end / 1000));
    const { trades } = await getTradesForWindow("cond", {
      windowStartMs: null,
      windowEndMs: end,
      safetyCeiling: 20,
    });
    restore();
    const big = trades.filter((t) => t.notionalUsdc >= 10000);
    if (big.length !== 1) throw new Error("fixture expected one 15k fill, got " + big.length);
    // Ensure the large fill is past the old hard 800 index (i=5 is within first page;
    // also assert total > 800 so filter runs on uncapped set)
    if (trades.length <= 800) throw new Error("expected >800 loaded for filter coverage");
    pass("$ filter applies to full loaded set");
  } catch (e) { fail("$ filter applies to full loaded set", e); }

  try {
    const cond = "0x1735b1017ecb676f673c31908e2bd7222dde7a70ba8c9f80f523afffdaac0208";
    let n = 0, pages = 0, cursor: string | undefined, hasMore = true;
    while (hasMore && pages < 15) {
      const u = new URL("https://data-api.polymarket.com/v2/trades");
      u.searchParams.set("condition", cond);
      u.searchParams.set("limit", "100");
      if (cursor) u.searchParams.set("cursor", cursor);
      const res = await fetch(u.toString(), { headers: { "User-Agent": "polyverse-test" } });
      if (!res.ok) throw new Error("live " + res.status);
      const j = await res.json();
      n += (j.data || []).length;
      pages++;
      hasMore = Boolean(j.pagination?.has_more);
      cursor = j.pagination?.next_cursor;
      if (!hasMore) break;
    }
    console.log("  live condition fills", n, "pages", pages);
    pass("live data-api pagination reachable");
  } catch (e) { fail("live data-api pagination reachable", e); }

  if (process.exitCode) { console.log("\\\\nSummary: FAILED"); process.exit(1); }
  console.log("\\\\nSummary: trades-window tests passed");
}
main();
`;

const r = spawnSync("npx", ["tsx", "-e", helper], {
  cwd: root,
  encoding: "utf8",
  timeout: 120000,
  env: { ...process.env },
});
process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
process.exit(r.status ?? 1);
