# Setup guide

This walks through everything needed to take the dashboard from mock data to live numbers. Assumes you're not a developer — no shortcuts, but no unnecessary jargon either.

## 1. Install Node.js

Node.js is what runs the dashboard on your laptop.

1. Go to <https://nodejs.org>.
2. Download the "LTS" version for your OS (currently Node 20 or later).
3. Run the installer with default options.
4. Open a terminal (macOS: Terminal app; Windows: PowerShell) and run:
   ```bash
   node --version
   ```
   You should see something like `v20.x.x`. If you do, you're set.

## 2. Install this project's dependencies

From a terminal, change into this folder and install:

```bash
cd "/path/to/IBN Marketing Dashboard"
npm install
```

First run takes a few minutes. Subsequent starts are instant.

## 3. Run in mock mode

```bash
npm run dev
```

Open <http://localhost:3000>. You'll see the dashboard with sample data. The three pills in the top-right should say "Meta: mock", "Pipedrive: mock", "WIP Sheet: mock". Good — that means the app is running correctly.

Stop the server any time with `Ctrl+C` in the terminal.

## 4. Create your environment file

```bash
cp .env.example .env.local
```

Open `.env.local` in any text editor. You'll fill in values below.

**Important:** never share or commit `.env.local`. It holds secrets.

## 5. Wire up Meta Ads (via the daily-export sheet tab)

The dashboard reads Meta spend from a tab on the same WIP spreadsheet (`Data - Spend - IBN/HS`) instead of hitting the Meta Marketing API directly. That tab is refreshed daily by an automated export, so the numbers are always <24h old. This avoids the Meta System User / token rigmarole entirely — the service account you set up in section 7 already has access.

All you need to do here:

1. Confirm the spend tab exists on the WIP spreadsheet, with one row per (ad set, campaign, date), and with these columns (case-insensitive):
   - `Report: Date`
   - `Campaign: Campaign Id`
   - `Campaign: Campaign name`
   - `Cost: Amount spend`
   - `Performance: Clicks`
   - `Performance: Impressions`
   - `Job Number`
   - `Homeshelf/IBuildNew` (brand)

2. In `.env.local`, these are pre-filled for Brendon's setup (covering both IBN and Homeshelf):
   ```
   META_SPEND_SHEET_RANGE='Data - Spend - IBN/HS'!A1:AZ50000
   META_SPEND_BRAND_FILTER=IBuildNew,Homeshelf
   ```
   Adjust the tab name if yours differs. `META_SPEND_BRAND_FILTER` is a comma-separated list of brand values (from the `Homeshelf/IBuildNew` column) that should be included. Leave it blank to include every row regardless of brand.

3. If you ever need to switch to pulling directly from the Meta Marketing API later (e.g. for near-realtime spend or for metrics the export doesn't carry), ask me to restore the API implementation — it's straightforward to swap `src/lib/meta.js` back.

## 6. Wire up Pipedrive

### 6a. Get an API token

1. In Pipedrive, click your profile icon (top-right) → **Personal preferences** → **API**.
2. Copy the API token. Paste into `.env.local` as `PIPEDRIVE_API_TOKEN`.
3. Set `PIPEDRIVE_DOMAIN` to your Pipedrive subdomain — if your URL is `ibuildnew.pipedrive.com`, the value is `ibuildnew`.

### 6b. Identify the lead + referral stages

A deal becomes a "lead" when it reaches certain stages, and a "referral" when it reaches others. You need the numeric IDs.

1. Go to **Settings → Company settings → Pipelines**.
2. Hover over each stage; the tooltip/URL shows its ID.
3. List the stage IDs that represent a lead (e.g. early-stage qualification).
4. List the stage IDs that represent a referral (e.g. "Referred to Builder", "Appointment Booked with Builder").
5. Paste comma-separated into `.env.local`:
   ```
   PIPEDRIVE_LEAD_STAGE_IDS=12,13,14
   PIPEDRIVE_REFERRAL_STAGE_IDS=20,21
   ```

### 6c. Custom field keys (optional but strongly recommended)

If Pipedrive deals carry a **Job Number** and/or a **Campaign** custom field, the dashboard can attribute leads/referrals back to the right builder/campaign.

1. In Pipedrive, go to **Settings → Data fields → Deal**.
2. Find the Job Number field, click the ⋮ menu → **Copy API key** (long hex string).
3. Repeat for the Campaign field.
4. Paste into `.env.local`:
   ```
   PIPEDRIVE_JOB_NUMBER_FIELD=abc123abc123abc123abc123abc123abc123abc1
   PIPEDRIVE_CAMPAIGN_FIELD=def456def456def456def456def456def456def4
   ```

If you don't have these fields yet, leave them blank. The dashboard will still count leads/referrals across the board; it just won't split them per-builder.

## 7. Wire up the WIP Google Sheet

Google Sheets needs a "service account" — a machine-only identity that can read the sheet.

### 7a. Create the service account (one-time)

1. Go to <https://console.cloud.google.com>.
2. Create a project (any name, e.g. "IBN Dashboard").
3. In the left menu: **APIs & Services → Enabled APIs** → **Enable APIs and Services** → search "Google Sheets API" → **Enable**.
4. Left menu: **IAM & Admin → Service Accounts** → **Create service account**.
5. Name it `ibn-dashboard-reader`. Click **Create and continue**, then **Done** (no roles needed).
6. Open the new service account → **Keys** tab → **Add key** → **Create new key** → **JSON**.
7. The browser will download a `.json` file. Save it in this project as:
   ```
   credentials/google-service-account.json
   ```
   Create the `credentials/` folder if it doesn't exist. Do **not** commit this file.

### 7b. Share the WIP sheet with the service account

1. Open the WIP sheet in Google Sheets.
2. Copy the service account's email address (it's inside the JSON file you just downloaded, in the `client_email` field — looks like `ibn-dashboard-reader@...iam.gserviceaccount.com`).
3. In the WIP sheet, click **Share** → paste the email → set to **Viewer** → **Send**.

### 7c. Plug it in

1. Copy the WIP sheet ID from its URL (the long string between `/d/` and `/edit`).
2. In `.env.local`:
   ```
   WIP_SHEET_ID=1aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789
   WIP_SHEET_RANGE=Contracts!A1:H1000
   ```
   Adjust `WIP_SHEET_RANGE` to match the tab name and columns you use. The first row must be headers containing:
   - **Job Number** (or Job, Job No)
   - **Builder Name** (or Builder)
   - **Revenue Per Referred Lead** (or Rev Per Referred Lead)
   - **Total Lead Target** (or Lead Target)
   - **Contract Start Date** (or Contract Start, Start Date) — accepts ISO (yyyy-mm-dd) or Australian dd/mm/yyyy
   - **Contract End Date** (or Contract End, End Date) — same formats

   Other columns are fine — they're ignored. Column order doesn't matter — the dashboard looks them up by header name.

## 7d. Share the Referrals sheet with the same service account

Referrals live on a **separate** spreadsheet from the WIP sheet. The dashboard reads them to calculate Referrals, Revenue and ROMS.

1. Open the referrals spreadsheet in Google Sheets.
2. Click **Share** → paste the service account's `client_email` (same one you used for the WIP sheet) → set to **Viewer** → **Send**.
3. Copy the referrals sheet ID from its URL (the long string between `/d/` and `/edit`).
4. In `.env.local`:
   ```
   REFERRALS_SHEET_ID=1qyJZrUF8yFjdgBkSAKVGEFDIy7NdyzjfOxVrRLZL-Bo
   REFERRALS_SHEET_RANGE='All Contacts'!A1:AS100000
   ```

The dashboard expects these column positions on the `All Contacts` tab:

- **Column I** — Attributed Date (the referral date)
- **Column W** — Job Number (must match JOB # on the WIP sheet)
- **Column X** — RPL (per-referral revenue — feeds ROMS directly)
- **Column Y** — Lead Return Reason (rows with a value here are excluded; only rows where this is blank count as a valid referral)

If the columns ever shift, only these four positions matter to the dashboard.

## 8. Restart and verify

Stop the dev server (`Ctrl+C`) and start it again:

```bash
npm run dev
```

The pills in the top-right should now read "live" for each integration that's configured. Any that's still "mock" means a credential is missing — check `.env.local` and the steps above.

## 9. Sharing with the marketing team

This prototype runs on your laptop only. To share with the team:

- **Easiest (short-term):** screen-share during a call, or walk through in-person.
- **Team access (needs infra):** deploy to Vercel (free tier) with env vars set in the Vercel dashboard, restrict access by Google Workspace login. I can walk you through that when you're ready.

## Troubleshooting

**"Port 3000 is in use"** → change the port: `npm run dev -- -p 3001` and open <http://localhost:3001>.

**"Meta Ads insights failed: 190"** → your token has expired or been revoked. Regenerate a new System User token in Business Manager.

**"Pipedrive deals failed: 401"** → API token is wrong. Double-check it in Personal preferences.

**"The caller does not have permission" (Sheets)** → the service account isn't shared on the WIP sheet. Re-share with the `client_email` from the JSON file.

**Numbers look wrong** → start with the aggregation file: `src/lib/aggregate.js` is the one place KPIs are calculated. Each metric has a comment next to it.
