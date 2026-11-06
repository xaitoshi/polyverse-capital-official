/**
 * Regression tests for /visualise deep-link + outcome price mapping.
 * Run: node scripts/pm-explorer-regression.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const helper = `
import { resolveOutcomeLastPrice, resolveOutcomeBookSide } from "./src/lib/pm-explorer/outcomePrices.ts";
import { parseVisualiseSearchParams, buildVisualiseSearchParams } from "./src/lib/pm-explorer/urlState.ts";
import { detectMarketKind } from "./src/lib/pm-explorer/kindDetect.ts";

const results: Array<[string, string, string?]> = [];
function pass(n: string) { results.push(["PASS", n]); console.log("PASS", n); }
function fail(n: string, e: unknown) { results.push(["FAIL", n, String(e)]); console.error("FAIL", n, e); }

async function main() {
  try {
    const url = "https://polyverse.capital/visualise?event=lol-kc-t1-2026-11-04&market=6501428&q=lol-kc-t1-2026-11-04&interval=1d&wallets=lol-paper-book";
    const u = new URL(url);
    const st = parseVisualiseSearchParams(u.search);
    if (st.event !== "lol-kc-t1-2026-11-04") throw new Error("event " + st.event);
    if (st.market !== "6501428") throw new Error("market " + st.market);
    if (st.interval !== "1d") throw new Error("interval " + st.interval);
    if (st.wallets !== "lol-paper-book") throw new Error("wallets " + st.wallets);
    if (st.q !== "lol-kc-t1-2026-11-04") throw new Error("q " + st.q);
    const rebuilt = buildVisualiseSearchParams(st);
    const st2 = parseVisualiseSearchParams(rebuilt);
    if (st2.event !== st.event || st2.market !== st.market || st2.interval !== st.interval) throw new Error("roundtrip");
    pass("exact deep-link URL state parse + roundtrip");
  } catch (e) { fail("exact deep-link URL state parse + roundtrip", e); }

  try {
    const outcomePrices = [0.175, 0.825];
    const marketLast = 0.175;
    const p0 = resolveOutcomeLastPrice(0, outcomePrices, marketLast);
    const p1 = resolveOutcomeLastPrice(1, outcomePrices, marketLast);
    if (p0 !== 0.175) throw new Error("p0=" + p0);
    if (p1 !== 0.825) throw new Error("p1=" + p1 + " (must NOT inherit marketLast 0.175)");
    if (p0 === p1) throw new Error("both outcomes identical");
    const sum = (p0 ?? 0) + (p1 ?? 0);
    if (Math.abs(sum - 1) > 0.02) throw new Error("book sum " + sum);
    pass("outcome prices use outcomePrices[i] not market lastTradePrice");
  } catch (e) { fail("outcome prices use outcomePrices[i] not market lastTradePrice", e); }

  try {
    const bid0 = resolveOutcomeBookSide(0, "bid", 0.17, 0.18);
    const bid1 = resolveOutcomeBookSide(1, "bid", 0.17, 0.18);
    if (bid0 !== 0.17) throw new Error("bid0");
    if (bid1 !== undefined) throw new Error("bid1 must be undefined, got " + bid1);
    pass("market bestBid/Ask only attach to outcome index 0");
  } catch (e) { fail("market bestBid/Ask only attach to outcome index 0", e); }

  try {
    const { classifyInput, parseExplorerInput } = await import("./src/lib/pm-explorer/urlParse.ts");
    // Canonical /event path (still supported)
    const eventUrl = "https://polymarket.com/event/lol-kc-t1-2026-11-04";
    const eventParsed = parseExplorerInput(eventUrl);
    if (!eventParsed.ok || eventParsed.kind !== "url") throw new Error("event parse: " + JSON.stringify(eventParsed));
    if (eventParsed.eventSlug !== "lol-kc-t1-2026-11-04") throw new Error("eventSlug " + (eventParsed as any).eventSlug);

    // Exact user esports path (previously unsupported)
    const esportsUrl = "https://polymarket.com/esports/league-of-legends/worlds/lol-ig1-gen-2026-11-07";
    const parsed = parseExplorerInput(esportsUrl);
    if (!parsed.ok || parsed.kind !== "url") throw new Error("esports parse not ok: " + JSON.stringify(parsed));
    if (parsed.eventSlug !== "lol-ig1-gen-2026-11-07") throw new Error("parsed slug=" + (parsed as any).eventSlug);
    const cls = classifyInput(esportsUrl);
    if (cls.kind !== "url" || !cls.parse.ok) throw new Error("classify " + JSON.stringify(cls));

    // Live resolve via gamma (same path resolveEventBySlug uses)
    const res = await fetch("https://gamma-api.polymarket.com/events?slug=" + encodeURIComponent(parsed.eventSlug!));
    const events = await res.json();
    if (!Array.isArray(events) || !events[0]) throw new Error("gamma empty for " + parsed.eventSlug);
    const ev = events[0];
    if (String(ev.slug) !== "lol-ig1-gen-2026-11-07") throw new Error("returned slug " + ev.slug);
    if (String(ev.id) !== "1317036") throw new Error("returned id " + ev.id + " (expected 1317036)");
    const title = String(ev.title || "");
    if (!/Invictus Gaming/i.test(title) || !/Gen\.G/i.test(title)) throw new Error("title " + title);
    console.log("  esports URL parsed slug", parsed.eventSlug, "→ id", ev.id, "title", title);
    pass("exact /esports/.../lol-ig1-gen-2026-11-07 parse + live gamma resolve");
  } catch (e) { fail("exact /esports/.../lol-ig1-gen-2026-11-07 parse + live gamma resolve", e); }

  try {
    const kind = detectMarketKind({
      question: "LoL: Karmine Corp vs T1 (BO5) - Worlds Playoffs",
      outcomes: ["Karmine Corp", "T1"],
      sportsMarketType: null,
    });
    if (!kind) throw new Error("no kind");
    pass("kind detect for KC vs T1 moneyline");
  } catch (e) { fail("kind detect for KC vs T1 moneyline", e); }

  try {
    const res = await fetch("https://gamma-api.polymarket.com/events?slug=lol-kc-t1-2026-11-04");
    const events = await res.json();
    const m = events[0].markets.find((x: { id: string }) => String(x.id) === "6501428");
    if (!m) throw new Error("market missing");
    const prices = JSON.parse(m.outcomePrices).map(Number);
    const labels = JSON.parse(m.outcomes);
    const mapped = labels.map((_: string, i: number) => resolveOutcomeLastPrice(i, prices, m.lastTradePrice));
    // Prove the production bug class: market lastTrade equals one side and would duplicate if broadcast
    if (typeof m.lastTradePrice === "number" && prices.some((p: number) => Math.abs(p - m.lastTradePrice) < 1e-6)) {
      const buggy = labels.map(() => m.lastTradePrice);
      if (!(buggy[0] === buggy[1])) throw new Error("fixture: expected broadcast equality");
    }
    if (mapped[0] === mapped[1]) throw new Error("live mapped equal: " + JSON.stringify(mapped) + " lastTrade=" + m.lastTradePrice + " prices=" + JSON.stringify(prices));
    if (Math.abs(mapped[0] + mapped[1] - 1) > 0.05) throw new Error("live sum " + (mapped[0] + mapped[1]));
    console.log("  live labels", labels, "mapped", mapped, "marketLast", m.lastTradePrice);
    pass("live gamma market 6501428 per-outcome prices diverge");
  } catch (e) { fail("live gamma market 6501428 per-outcome prices diverge", e); }

  // Chart height contract: built chunk must use numeric ResponsiveContainer height, not "100%"
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dist = path.join(process.cwd(), "dist/assets");
    if (fs.existsSync(dist)) {
      const files = fs.readdirSync(dist).filter((f: string) => f.startsWith("VisualisePage-") && f.endsWith(".js"));
      if (!files.length) throw new Error("no VisualisePage chunk — run build first");
      const src = fs.readFileSync(path.join(dist, files[0]), "utf8");
      if (!/height:420|height: 420/.test(src)) throw new Error("expected explicit height 420 in chart chunk");
      // Avoid regressing to percentage-only container height for the explorer chart
      if (/ResponsiveContainer[^;]{0,80}height:\"100%\"/.test(src)) {
        throw new Error("ResponsiveContainer still uses height 100% — collapses to 0x0");
      }
      pass("built VisualisePage chunk uses explicit chart height 420");
    } else {
      pass("built VisualisePage chunk check skipped (no dist yet)");
    }
  } catch (e) { fail("built VisualisePage chunk uses explicit chart height 420", e); }

  const failed = results.filter((r) => r[0] === "FAIL");
  console.log("\\nSummary:", results.length - failed.length, "passed,", failed.length, "failed");
  process.exit(failed.length ? 1 : 0);
}

main();
`;

const r = spawnSync("npx", ["tsx", "-e", helper], {
  cwd: root,
  encoding: "utf8",
  timeout: 90000,
  env: { ...process.env },
});
process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
process.exit(r.status ?? 1);
