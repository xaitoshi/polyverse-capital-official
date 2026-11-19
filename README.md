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

- `/tennis` — live court, today's picks, record strip
- `/tennis/players/:id` — rank, Elo, recent Tennis Abstract matches, picks on that player
- `/tennis/record` — settled and pending picks, ROI, Brier, log loss, tier and surface splits, calibration, methodology

The model is `polyverse-tennis-v1` (`src/lib/tennis/methodology.ts`). A pick is written once, before start, and is never edited. Matches that are already live when the book first sees them stay without a pick. Missing stats render as —.

Data, free stack:

- Markets and scores: Polymarket gamma, series `10365` (ATP), `10366` (WTA), `11634` (ITF). `Accept-Encoding: gzip` on pages over 50.
- Rankings: ESPN `site.web.api.espn.com` ATP and WTA rankings (the `site.api.espn.com` host returns 403).
- Elo and recent serve lines: Tennis Abstract. Node's fetch is Cloudflare-challenged from some hosts; `scripts/tennis/build_snapshot.ts` uses Python urllib for those URLs and waits between player files.
- Photos: Wikimedia Commons when the Wikipedia page is a tennis player, with license and attribution. Otherwise initials.

Rebuild the committed snapshot (this is what preview serves when `DATABASE_URL` is unset):

```bash
npm run build:tennis-data
```

Storage and cron, when configured:

- `DATABASE_URL` — Postgres. Schema `db/tennis/001_init.sql` is applied by the cron on first run.
- `CRON_SECRET` — required. Vercel Cron calls `/api/tennis-cron?job=ingest|picks|settle` with `Authorization: Bearer $CRON_SECRET`. Schedules are every 10 minutes for ingest and picks, every 15 for settlement. A Hobby plan only allows a daily cron; the routes themselves are safe to call on that cadence from any scheduler.
- `API_TENNIS_KEY` — reserved. The `ApiTennisProvider` class throws until a paid adapter is wired. It is not used to fill gaps.

Without `DATABASE_URL` the read API returns `source: "unconfigured"` and the page uses `public/data/tennis/`. An empty book is an empty state, not fake matches.

Tests: `npm run test:tennis`

