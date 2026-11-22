<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/67e1ba6c-249a-401e-ab17-50bc76d2c990

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`


## Polymarket Visualise (`/visualise`)

Interactive, read-only Polymarket market explorer at **https://polyverse.capital/visualise**.

1. Open `/visualise`
2. Search any market by keyword **or** paste a Polymarket event URL (`https://polymarket.com/event/<slug>`)
3. Pick a child market; explore price lines, trade bubbles, wallet table
4. Optional LoL QA preset chip loads KC vs T1 + paper-book watch wallets

Data uses existing host proxies (`/api/polymarket`, `/api/clob`, `/api/poly-data/v2/...`). Adapter versions are shown in the page footer. No trading / signing.

Smoke / schema lock (network):

```bash
node scripts/pm-explorer-smoke.mjs
```

## LoL Esports team profiles (`/lolesports`)

Searchable team cards built from Oracle's Elixir public yearly CSVs.

- SPA route: `/lolesports` (HTML). Data assets: `/data/lolesports/` (JSON under `public/data/lolesports/`). Do **not** put `index.json` under `public/lolesports/` — that shadows the SPA.
- Snapshots: `public/data/lolesports/` (index + per-team JSON). Do **not** commit raw OE CSVs or `oe.db`.
- Rebuild data: `npm run build:lolesports-data` (requires local OE raw at `/workspace/lol-model/data/raw` or `LOL_OE_RAW`).
- Scoring: Polyverse `polyverse-lolesports-v1.1` (off-meta = pick+ban presence PB%, not role-pick share) — see `public/data/lolesports/methodology.json`. Drafting grade is an opponent-adjusted **proxy**, not causal draft quality.
- Dual honest cutoffs: **OE detailed player/combat stats** through the OE dump max; **match W/L + Elo** may extend via `lol-model/scrape_golgg.py` thin rows after OE lag (never invent GD@15/player combat). See `public/data/lolesports/meta.json` + `refresh_verification.json`.
- OE public Drive often quota-blocks; user Drive OE copy must be newer than local before replacing.
- Tests: `npm run test:lolesports`

## Tennis (`/tennis`)

Public singles board for every open Polymarket tennis match-winner market (ATP, WTA, Challenger, ITF). Doubles are excluded. Polyverse does not send orders. Every control in the trade card and every row's Trade link opens https://share.xyz/r/polyverse in a new tab.

- `/tennis` — live court and today's picks for live and upcoming matches only. Suspended, finished, voided, and stale events are not on this page.
- `/tennis/players/:id` — rank, Elo, recent Tennis Abstract matches, picks on that player
- `/tennis/record` — settled and pending picks, ROI, Brier, log loss, tier and surface splits, calibration, methodology

The model is `polyverse-tennis-v1` (`src/lib/tennis/methodology.ts`). A pick is written once, before start, and is never edited. Matches that are already live when the book first sees them stay without a pick. Missing stats render as —.

Data, free stack:

- Markets and scores: Polymarket gamma, series `10365` (ATP), `10366` (WTA), `11634` (ITF). `Accept-Encoding: gzip` on pages over 50.
- Country: Polymarket team flag (`country-flags/{code}.png`; `un` means unknown), then the WTA player record for women, then ESPN.
- Rankings: ESPN ATP/WTA top 150, WTA official `api.wtatennis.com` singles rank for women outside that list, and the rank column on Tennis Abstract recent results. ITF's own rankings site is behind Incapsula and is not used.
- Elo and recent serve lines: Tennis Abstract, including guessed `jsfrags/{CamelName}.js` pages that cover many ITF and Challenger players. Node's fetch is Cloudflare-challenged; the snapshot script uses Python urllib and waits between player files.
- Photos: Wikimedia Commons when the article is that tennis player, else the ESPN rankings headshot. Otherwise initials.

The site you see at `/tennis` is the committed snapshot in `public/data/tennis/` whenever `DATABASE_URL` is unset. The page prefers `/api/tennis` only when that route returns `source: "postgres"`.

Refresh the snapshot by hand with:

```bash
npm run build:tennis-data
```

`.github/workflows/tennis-snapshot.yml` runs that command every day at 02:00 UTC (10:00 in Singapore, cron `0 2 * * *`) and commits `public/data/tennis/` to `main`. Vercel production for this project tracks `main`, so that push is what publishes the new board. The Vercel cron cannot rewrite these static files, and Hobby still only allows a daily cron, so the refresh does not depend on a paid plan.

The workflow push has to use a personal access token. A push made with the default `GITHUB_TOKEN` does not fire the Vercel Git webhook, and production would stay on the previous snapshot.

Add this Actions secret (repo Settings → Secrets and variables → Actions). It is not a Vercel env var:

- `TENNIS_COMMIT_TOKEN` — fine-grained PAT for the GitHub user who can write to `xaitoshi/polyverse-capital-official`, with Contents: Read and write on this repo only. No other scopes.

Until that secret exists, the scheduled run stops before it writes and the board stays on the last snapshot that was merged. Merging a pull request to `main` still deploys through the existing Vercel Git integration and does not need the token. `main` is not branch-protected, so the token can push the snapshot commit directly. You can also run the workflow by hand with "Run workflow" after the secret is saved.

A snapshot freezes the live flag. The page hides a `live` row whose scheduled start is more than 12 hours ago when `source` is `snapshot`. Upcoming rows already drop out 6 hours after start. Rows from Postgres are not hidden that way: once `DATABASE_URL` is set, that book is the live one.

Storage and cron, kept for when a database is configured later:

- `DATABASE_URL` — Postgres. Schema `db/tennis/001_init.sql` is applied by the cron on first run. The page then prefers `/api/tennis` over the snapshot. Production does not have this variable today.
- `CRON_SECRET` — required for `/api/tennis-cron`. The checked-in Vercel schedule is once a day at 02:00 UTC (`0 2 * * *`, `job=all`), the same time as the snapshot workflow. A 10-minute cron is rejected on Hobby. Call the route yourself on whatever cadence you want:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
  "https://polyverse.capital/api/tennis-cron?job=all"
```

`job` is `ingest`, `picks`, `settle`, or `all`. Without `CRON_SECRET` the route is 401. Without `DATABASE_URL` it returns 200 and does not write anything. Neither variable is set in production, and this repo does not add them. Picks already stored are not updated.

- `API_TENNIS_KEY` — reserved. The `ApiTennisProvider` class throws until a paid adapter is wired. It is not used to fill gaps.

Without `DATABASE_URL` the read API returns `source: "unconfigured"` and the page uses `public/data/tennis/`. An empty book is an empty state, not fake matches. Coverage of the current board is in `public/data/tennis/coverage.json`.

Tests: `npm run test:tennis`

