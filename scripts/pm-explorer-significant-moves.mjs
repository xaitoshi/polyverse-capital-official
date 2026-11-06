/**
 * Unit + live smoke for significant price-move detection.
 * Run: node scripts/pm-explorer-significant-moves.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const helper = `
import { detectSignificantMoves, effectiveWindowMs, seriesTickStats, buildTokenSeries } from "./src/lib/pm-explorer/significantMoves.ts";
import {
  FIXTURE_REVERT_RISE,
  FIXTURE_TRUNCATED_TRADES,
  FIXTURE_RIGHT_EDGE,
} from "./src/lib/pm-explorer/__fixtures__/significantMovesFixtures.ts";

function pass(n: string) { console.log("PASS", n); }
function fail(n: string, e: unknown) { console.error("FAIL", n, e); process.exitCode = 1; }

async function main() {
  try {
    const series = buildTokenSeries(FIXTURE_REVERT_RISE.prices, FIXTURE_REVERT_RISE.tokenId);
    const stats = seriesTickStats(series);
    if (stats.count < 5) throw new Error("expected sparse series");
    const eff = effectiveWindowMs(5 * 60_000, stats.medianGapMs);
    if (eff.scanMs < stats.medianGapMs) throw new Error("scan finer than median gap");
    if (eff.scanMs < 5 * 60_000) throw new Error("scan shorter than requested");
    pass("window expands to tick resolution (not fake 1-min)");
  } catch (e) { fail("window expands to tick resolution (not fake 1-min)", e); }

  try {
    const moves = detectSignificantMoves({
      ...FIXTURE_REVERT_RISE,
      windowKey: "15m",
      maxMoves: 6,
      minAbsPp: 3,
    });
    if (!moves.length) throw new Error("expected at least one move");
    const rise = moves.find((m) => m.direction === "up" && m.absPp >= 4);
    if (!rise) throw new Error("expected up move ~5pp, got " + JSON.stringify(moves.map((m) => ({ pp: m.absPp, d: m.direction }))));
    if (rise.associatedTrades.some((a) => a.trade.tokenId !== FIXTURE_REVERT_RISE.tokenId)) {
      throw new Error("mixed outcomes in associated trades");
    }
    if (rise.buyNotional <= 0) throw new Error("expected buy notional during rise");
    if (rise.persistence.kind === "unavailable") throw new Error("expected measurable persistence");
    if (rise.persistence.kind === "held") throw new Error("fixture should revert, got held");
    const blob = rise.contextLines.join(" ");
    if (/\b(these fills )?caused the move\b|informed wallet|news verified|catalyst confirmed/i.test(blob)) throw new Error("causal language");
    if (!/association ≠ evidence|association != evidence|not evidence these fills/i.test(blob)) throw new Error("missing association disclaimer");
    pass("revert-rise fixture: pp, isolation, persistence, disclaimers");
  } catch (e) { fail("revert-rise fixture: pp, isolation, persistence, disclaimers", e); }

  try {
    const moves = detectSignificantMoves({
      ...FIXTURE_TRUNCATED_TRADES,
      windowKey: "15m",
      minAbsPp: 5,
    });
    if (!moves.length) throw new Error("no moves");
    const m = moves[0]!;
    if (m.coverage.status !== "truncated_sample") throw new Error("expected truncated_sample, got " + m.coverage.status);
    if (!/Do not attribute the full/i.test(m.coverage.note)) throw new Error("missing truncation warning");
    pass("truncated trades never fully attributed");
  } catch (e) { fail("truncated trades never fully attributed", e); }

  try {
    const moves = detectSignificantMoves({
      ...FIXTURE_RIGHT_EDGE,
      windowKey: "5m",
      minAbsPp: 5,
    });
    const m = moves.find((x) => x.absPp >= 5);
    if (!m) throw new Error("expected right-edge move");
    if (m.persistence.kind !== "unavailable") throw new Error("expected unavailable persistence, got " + m.persistence.kind);
    pass("right-edge persistence unavailable");
  } catch (e) { fail("right-edge persistence unavailable", e); }

  try {
    const moves = detectSignificantMoves({
      ...FIXTURE_REVERT_RISE,
      windowKey: "15m",
      minAbsPp: 3,
      playheadMs: Date.parse("2026-11-04T12:30:00.000Z"),
    });
    for (const m of moves) {
      if (m.endMs > Date.parse("2026-11-04T12:30:00.000Z")) throw new Error("future leakage in move end");
      for (const a of m.associatedTrades) {
        if (Date.parse(a.trade.ts) > Date.parse("2026-11-04T12:30:00.000Z")) throw new Error("future trade");
      }
    }
    pass("playhead blocks future leakage");
  } catch (e) { fail("playhead blocks future leakage", e); }

  try {
    const evRes = await fetch("https://gamma-api.polymarket.com/events?slug=lol-kc-t1-2026-11-04");
    const events = await evRes.json();
    const market = (events[0]?.markets || []).find((x: { id: string }) => String(x.id) === "6501428");
    if (!market) throw new Error("market 6501428 missing");
    const tokenIds = JSON.parse(market.clobTokenIds);
    const labels = JSON.parse(market.outcomes);
    const t1Idx = labels.findIndex((l: string) => /\\bT1\\b/i.test(l));
    const tokenId = tokenIds[t1Idx >= 0 ? t1Idx : 1];
    const label = labels[t1Idx >= 0 ? t1Idx : 1];
    const hist = await fetch(
      "https://clob.polymarket.com/prices-history?market=" + encodeURIComponent(tokenId) + "&interval=1w&fidelity=60"
    ).then((r) => r.json());
    const prices = (hist.history || []).map((h: { t: number; p: number }) => ({
      ts: new Date((h.t > 1e12 ? h.t : h.t * 1000)).toISOString(),
      tokenId,
      price: h.p,
      source: "clob",
    }));
    const tradesPayload = await fetch(
      "https://data-api.polymarket.com/v2/trades?condition=" + encodeURIComponent(market.conditionId) + "&limit=100"
    ).then((r) => r.json());
    const trades = (tradesPayload.data || [])
      .filter((r: { token_id: string }) => r.token_id === tokenId)
      .map((r: any, i: number) => ({
        id: String(r.transaction_hash || i),
        ts: new Date((r.timestamp > 1e12 ? r.timestamp : r.timestamp * 1000)).toISOString(),
        tokenId: r.token_id,
        side: String(r.side).toUpperCase() === "SELL" ? "SELL" : "BUY",
        price: Number(r.price),
        sizeShares: Number(r.size),
        notionalUsdc: Math.abs(Number(r.price) * Number(r.size)),
        wallet: String(r.proxy_wallet || ""),
      }));
    const completeness = tradesPayload.pagination?.has_more ? "partial_page" : "full";
    const moves = detectSignificantMoves({
      tokenId,
      outcomeLabel: label,
      prices,
      trades,
      provenance: {
        asOf: new Date().toISOString(),
        sources: ["clob", "data-api"],
        completeness,
        warnings: completeness === "partial_page" ? ["Trade history truncated after 800 rows"] : [],
        adapterVersions: {},
      },
      windowKey: "15m",
      maxMoves: 6,
    });
    console.log(
      "  live smoke",
      label,
      "ticks",
      prices.length,
      "trades_sample",
      trades.length,
      "moves",
      moves.length,
      JSON.stringify(moves.slice(0, 3).map((m) => ({
        pp: +m.absPp.toFixed(1),
        dir: m.direction,
        cover: m.coverage.status,
        persist: m.persistence.kind,
        during: m.tradeCount,
        buy: +m.buyNotional.toFixed(0),
        sell: +m.sellNotional.toFixed(0),
        start: m.startTs,
        end: m.endTs,
      })))
    );
    if (moves[0]) console.log("  example_context:", moves[0].contextLines[0]);
    pass("live KC/T1 significant-move smoke");
  } catch (e) { fail("live KC/T1 significant-move smoke", e); }

  if (process.exitCode) {
    console.log("\\nSummary: FAILED");
    process.exit(1);
  }
  console.log("\\nSummary: all significant-move tests passed");
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
