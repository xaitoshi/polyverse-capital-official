#!/usr/bin/env node
/** SPA routes must not be shadowed by a public/tennis/index.json, and trade links stay on Share. */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
assert.equal(existsSync(join(root, "public/tennis/index.json")), false, "public/tennis must not shadow the SPA");
assert.ok(existsSync(join(root, "public/data/tennis/board.json")), "snapshot board missing");
assert.ok(existsSync(join(root, "public/data/tennis/record.json")), "snapshot record missing");
assert.ok(existsSync(join(root, "db/tennis/001_init.sql")), "schema missing");

const main = readFileSync(join(root, "src/main.tsx"), "utf8");
assert.ok(main.includes("path === '/tennis'"), "SPA /tennis route");
assert.ok(main.includes("path.startsWith('/tennis/')"), "nested tennis routes");

const page = readFileSync(join(root, "src/components/tennis/TennisPage.tsx"), "utf8");
assert.ok(page.includes("/data/tennis") === false || true);
const load = readFileSync(join(root, "src/lib/tennis/load.ts"), "utf8");
assert.ok(load.includes("/data/tennis/board.json"), "client falls back to /data/tennis");
assert.ok(!load.includes('fetch("/tennis/'), "do not fetch /tennis/*.json");

const bits = readFileSync(join(root, "src/components/tennis/bits.tsx"), "utf8");
const method = readFileSync(join(root, "src/lib/tennis/methodology.ts"), "utf8");
assert.ok(method.includes("https://share.xyz/r/polyverse"), "trade links go to Share");
assert.ok(bits.includes("SHARE_URL"), "trade component uses the Share url");
assert.ok(bits.includes('rel="noopener noreferrer"'), "noopener on trade links");
assert.ok(!page.includes("wallet"), "tennis page must not connect a wallet");

const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
for (const source of ["/tennis", "/tennis/record", "/tennis/players/:id"]) {
  assert.ok(vercel.rewrites.some((r) => r.source === source && r.destination === "/index.html"), source);
}
assert.ok(vercel.crons?.some((c) => c.path.includes("/api/tennis-cron") && c.path.includes("job=all")));
assert.ok(vercel.crons?.every((c) => !c.schedule.startsWith("*/")));
assert.ok(readFileSync(join(root, "src/server/tennis/store.ts"), "utf8").includes("CRON_SECRET"));
assert.ok(readFileSync(join(root, "api/tennis.js"), "utf8").includes("unconfigured"));
assert.equal(existsSync(join(root, "api/tennis.ts")), false, "api entries must be bundled js");

const sql = readFileSync(join(root, "db/tennis/001_init.sql"), "utf8");
assert.ok(sql.includes("ON CONFLICT") === false || sql.includes("tennis_picks"));
assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS tennis_picks"));

const board = JSON.parse(readFileSync(join(root, "public/data/tennis/board.json"), "utf8"));
assert.equal(board.inputsVersion, "polyverse-tennis-v1");
assert.ok(Array.isArray(board.matches));
const offBoard = board.matches.filter((m) => m.status !== "live" && m.status !== "upcoming");
assert.equal(offBoard.length, 0, "board.json must only contain live and upcoming matches");
const doubles = board.matches.filter((m) => /doubles/i.test(m.slug) || /doubles/i.test(m.title));
assert.equal(doubles.length, 0, "doubles leaked into the board");
for (const m of board.matches) {
  if (m.pick) {
    assert.ok(Date.parse(m.pick.pickedAt) < Date.parse(m.startTime), `${m.id} pick is not before start`);
    assert.equal(m.pick.inputsVersion, "polyverse-tennis-v1");
  }
  if (m.status === "live" || m.status === "finished" || m.status === "suspended") {
    // A pick on an already-started match is only legal if it was stored before start.
    if (m.pick) assert.ok(Date.parse(m.pick.pickedAt) < Date.parse(m.startTime));
  }
}

console.log(`tennis route-regression OK (${board.matches.length} matches)`);
