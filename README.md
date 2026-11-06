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
