#!/usr/bin/env node
/**
 * Local/static regression: SPA path must not be shadowed by data index.json.
 * Also asserts generator output + client fetch prefix stay on /data/lolesports.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const oldShadow = join(root, "public/lolesports/index.json");
const dataIndex = join(root, "public/data/lolesports/index.json");
const dataMeta = join(root, "public/data/lolesports/meta.json");

assert.equal(existsSync(oldShadow), false, "public/lolesports/index.json must not exist (shadows SPA)");
assert.ok(existsSync(dataIndex), "data index missing");
assert.ok(existsSync(dataMeta), "data meta missing");

const page = readFileSync(join(root, "src/components/lolesports/LolesportsPage.tsx"), "utf8");
assert.ok(page.includes("/data/lolesports/index.json"), "page must fetch /data/lolesports");
assert.ok(!page.includes('fetch("/lolesports/'), "page must not fetch /lolesports/*.json");

const main = readFileSync(join(root, "src/main.tsx"), "utf8");
assert.ok(main.includes("path === '/lolesports'"), "SPA route /lolesports required");

const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
assert.ok(vercel.rewrites.some((r) => r.source === "/lolesports" && r.destination === "/index.html"));

const build = readFileSync(join(root, "scripts/lolesports/build_snapshots.py"), "utf8");
assert.ok(build.includes('public" / "data" / "lolesports"') || build.includes("public/data/lolesports"), "generator out-dir");

console.log("lolesports route-regression OK");
