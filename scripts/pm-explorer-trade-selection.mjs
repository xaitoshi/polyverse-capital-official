/**
 * Unit tests for trade click / cluster selection (no browser).
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const helper = `
import {
  clusterOverlappingTrades,
  selectTradeFromClick,
  pickFromCluster,
  clearTradeInspect,
  isValidTxHash,
  polygonTxUrl,
  tradePointToChartDatum,
  type ChartTradeDatum,
} from "./src/lib/pm-explorer/tradeSelection.ts";
import type { TradePoint } from "./src/lib/pm-explorer/types.ts";

function pass(n: string) { console.log("PASS", n); }
function fail(n: string, e: unknown) { console.error("FAIL", n, e); process.exitCode = 1; }

function mk(partial: Partial<TradePoint> & { id: string; ts: string }): TradePoint {
  return {
    tokenId: "tok-a",
    side: "BUY",
    price: 0.8,
    sizeShares: 10,
    notionalUsdc: 100,
    wallet: "0xabc0000000000000000000000000000000000001",
    ...partial,
  };
}

const base = Date.parse("2026-11-04T12:00:00.000Z");

try {
  if (isValidTxHash("0x" + "ab".repeat(32)) !== true) throw new Error("valid");
  if (isValidTxHash("0xdead") !== false) throw new Error("short");
  if (isValidTxHash(undefined) !== false) throw new Error("undef");
  if (!polygonTxUrl("0x" + "cd".repeat(32))?.includes("polygonscan.com/tx/")) throw new Error("url");
  if (polygonTxUrl("nope") !== null) throw new Error("bad url");
  pass("tx hash validation — only valid hashes get explorer links");
} catch (e) { fail("tx hash validation — only valid hashes get explorer links", e); }

try {
  const t0 = mk({ id: "a", ts: new Date(base).toISOString(), notionalUsdc: 500 });
  const t1 = mk({
    id: "b",
    ts: new Date(base + 30_000).toISOString(),
    notionalUsdc: 2000,
    side: "SELL",
    wallet: "0xabc0000000000000000000000000000000000002",
  });
  const t2 = mk({
    id: "c",
    ts: new Date(base + 10 * 60_000).toISOString(),
    notionalUsdc: 100,
  });
  const pts: ChartTradeDatum[] = [t0, t1, t2].map((tr) =>
    tradePointToChartDatum(tr, "T1", false, false)
  );
  const cluster = clusterOverlappingTrades(pts, pts[0]!);
  if (cluster.length !== 2) throw new Error("expected 2 overlapping, got " + cluster.length);
  if (cluster[0]!.tradeId !== "b") throw new Error("largest first");
  const far = clusterOverlappingTrades(pts, pts[2]!);
  if (far.length !== 1) throw new Error("far should be alone");
  pass("overlap cluster groups nearby icons, ranks by notional");
} catch (e) { fail("overlap cluster groups nearby icons, ranks by notional", e); }

try {
  const t0 = tradePointToChartDatum(
    mk({ id: "solo", ts: new Date(base).toISOString() }),
    "T1",
    true,
    true
  );
  const st = selectTradeFromClick([t0], t0);
  if (st.selectedId !== "solo") throw new Error("solo should auto-select");
  if (st.cluster.length !== 1) throw new Error("cluster");
  const t1 = tradePointToChartDatum(
    mk({ id: "x", ts: new Date(base + 10_000).toISOString(), notionalUsdc: 9 }),
    "T1",
    false,
    false
  );
  const t2 = tradePointToChartDatum(
    mk({
      id: "y",
      ts: new Date(base + 20_000).toISOString(),
      notionalUsdc: 99,
      wallet: "0xabc0000000000000000000000000000000000099",
    }),
    "T1",
    false,
    false
  );
  const multi = selectTradeFromClick([t1, t2], t1);
  if (multi.selectedId !== null) throw new Error("multi must not auto-select — need disambiguation");
  if (multi.cluster.length !== 2) throw new Error("cluster size");
  const picked = pickFromCluster(multi, "y");
  if (picked.selectedId !== "y") throw new Error("pick");
  const cleared = clearTradeInspect();
  if (cleared.selectedId || cleared.cluster.length) throw new Error("clear");
  pass("click selects solo; overlap requires explicit pick; clear works");
} catch (e) { fail("click selects solo; overlap requires explicit pick; clear works", e); }

try {
  // Outcome isolation in datum mapping
  const a = tradePointToChartDatum(
    mk({ id: "1", ts: new Date(base).toISOString(), tokenId: "tok-a" }),
    "T1",
    false,
    false
  );
  const b = tradePointToChartDatum(
    mk({ id: "2", ts: new Date(base).toISOString(), tokenId: "tok-b" }),
    "KC",
    false,
    false
  );
  const c = clusterOverlappingTrades([a, b], a);
  if (c.length !== 1 || c[0]!.tokenId !== "tok-a") throw new Error("must not mix outcomes");
  pass("cluster never mixes outcomes");
} catch (e) { fail("cluster never mixes outcomes", e); }

if (process.exitCode) {
  console.log("\\nSummary: trade-selection FAILED");
  process.exit(1);
}
console.log("\\nSummary: trade-selection passed");
`;

const r = spawnSync("npx", ["tsx", "-e", helper], {
  cwd: root,
  encoding: "utf8",
  timeout: 60000,
  env: { ...process.env },
});
process.stdout.write(r.stdout || "");
process.stderr.write(r.stderr || "");
process.exit(r.status ?? 1);
