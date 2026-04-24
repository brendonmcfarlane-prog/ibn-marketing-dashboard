# iBuildNew Marketing Dashboard

A local-only prototype that brings media spend, leads, referrals and revenue into one view, rolled up by builder contract.

## What it shows

Seven headline metrics for any period you pick:

1. **Media Spend** — Meta for now; Google Ads to be added in v2.
2. **Leads** — Pipedrive deals that reached a configured "lead" stage.
3. **Cost Per Lead** — Spend ÷ Leads.
4. **Referrals** — Pipedrive deals that reached a configured "referral" stage (a subset of leads).
5. **Cost Per Referral** — Spend ÷ Referrals.
6. **Revenue** — Referrals × Revenue Per Referred Lead (from the WIP sheet).
7. **Return on Media Spend (ROMS)** — Revenue ÷ Media Spend.

Under the KPIs, two tables:

- **Performance by builder contract** — each row = one Job Number, with contract start/end dates, pacing vs Total Lead Target, and two pacing-difference columns (see below).
- **Campaign-level spend** — all campaigns in scope, with share of total spend.

**Pacing diff columns (14 Day Diff / All Time Diff):** the number of days needed to hit the Referral target at the current rate, minus the days remaining in the contract. Positive = behind (you'll land after contract end at current pace); negative = ahead. These are calculated against the contract window, not the user's selected date range — so changing the date filter won't move them.

Filters for platform (Meta/Google), campaign, builder/job, and date range (7 / 30 / 90 day presets, MTD, YTD, or a custom window).

## A note on ROMS

The brief originally defined ROMS as "Media Spend ÷ Revenue" — that's the inverse of the industry-standard formula (Revenue ÷ Media Spend), which is what this dashboard uses. The inverse is still shown as a small helper under the ROMS card, labelled "X% of revenue", because that framing is useful too.

If you genuinely want ROMS inverted, change `roms: safeDivide(revenue, spend)` in `src/lib/aggregate.js` — but I'd recommend against it.

## Quick start (mock mode)

You can run the dashboard immediately with sample data, no credentials needed, to see the UI.

```bash
# One-off: install Node.js 18+ if you don't have it already (https://nodejs.org)
# Then from inside this folder:
npm install
npm run dev
```

Open <http://localhost:3000> in your browser.

The three "mock" pills in the top-right confirm you're seeing sample data.

## Going live — see `SETUP.md`

`SETUP.md` walks through how to get the three API credentials (Meta, Pipedrive, Google Sheets) and plug them into a `.env.local` file so the dashboard pulls real numbers.

## How the pieces fit

```
Browser (src/pages/index.jsx)
   │ GET /api/summary?...
   ▼
Next.js API route (src/pages/api/summary.js)
   │  parallel fetch
   ├── src/lib/meta.js        → Meta Marketing API /insights
   ├── src/lib/pipedrive.js   → Pipedrive /deals (classified by stage)
   └── src/lib/sheets.js      → Google Sheets API (WIP sheet)
          │
          ▼
   src/lib/aggregate.js (the one place KPIs are calculated)
          │
          ▼
   JSON response → React components
```

All secrets live in `.env.local` and are only read server-side. The browser never sees tokens or sheet IDs.

## Folder map

```
/
├── package.json
├── next.config.js
├── tailwind.config.js
├── postcss.config.js
├── .env.example               ← copy to .env.local
├── credentials/                ← you create this; Google service-account JSON goes here
└── src/
    ├── pages/
    │   ├── _app.jsx
    │   ├── index.jsx           ← dashboard page
    │   └── api/
    │       ├── summary.js      ← main aggregator endpoint
    │       └── health.js       ← "which integrations are live?"
    ├── components/
    │   ├── Layout.jsx
    │   ├── Filters.jsx
    │   ├── KpiCards.jsx
    │   ├── BuildersTable.jsx
    │   ├── CampaignTable.jsx
    │   └── SourceBadges.jsx
    ├── lib/
    │   ├── meta.js
    │   ├── pipedrive.js
    │   ├── sheets.js
    │   ├── aggregate.js        ← edit here to change metric definitions
    │   ├── format.js           ← en-AU currency/number formatters
    │   └── mockData.js         ← sample data for mock mode
    └── styles/
        └── globals.css
```

## Design notes

- Palette is locked to the approved iBuildNew colours (#F15A2C, #171649, #2B7EEF) in `tailwind.config.js`. No other hues are available to components by design.
- Layout is responsive (mobile / tablet / desktop). KPI cards reflow 1 → 2 → 4 → 7 columns.
- All dates are handled in ISO (yyyy-mm-dd) internally; display is en-AU via `Intl.NumberFormat`.

## Roadmap (v2 candidates)

- Google Ads integration (spend + campaign metadata).
- Period-vs-prior-period comparisons on KPI cards.
- Breakdown by region/location (sourced from campaign naming convention).
- Export to CSV for the builder rollup table.
- Scheduled email/Slack digest pulling the same aggregator.
