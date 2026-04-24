# Deploying the IBN Marketing Dashboard to Vercel

This is the end-to-end guide to getting the dashboard running at a
`*.vercel.app` URL so the marketing team can view it without you
running `npm run dev` locally.

Estimated time: **30–40 minutes** if nothing goes sideways.

Flow at a glance:

```
Your laptop  ──►  GitHub (private repo)  ──►  Vercel (builds & hosts)
```

Every time you push a change to GitHub, Vercel rebuilds automatically.

---

## What you need before you start

- A GitHub account with access to create a new private repo
- A Vercel account logged in with the same email (or linked to your
  GitHub login)
- A **Vercel Pro** workspace — required for the Password Protection
  feature. US$20/month. You can upgrade inside Vercel after you create
  the project; the first deploy will still work on Hobby, the password
  gate is just added after the upgrade.
- The Google service-account JSON key file you've been using locally
  (the one at `./credentials/google-service-account.json`). You'll paste
  its contents into a Vercel environment variable — the file itself is
  not committed to git.

---

## Step 1 — Push the code to a new private GitHub repo

You do this from a terminal, standing inside this project folder
(`IBN Marketing Dashboard/`).

### 1a. Create the GitHub repo

Open GitHub in a browser → top-right **+** → **New repository**.

- **Repository name:** `ibn-marketing-dashboard` (or whatever you want)
- **Visibility:** **Private** — this is commercial data, do not make it public
- **Do NOT** tick "Add a README", "Add .gitignore" or "Add a license"
  (the project already has these; ticking them creates a merge conflict
  on the very first push)
- Click **Create repository**

GitHub now shows a setup page. Copy the URL under "Quick setup" — the
HTTPS one, looks like `https://github.com/<you>/ibn-marketing-dashboard.git`.

### 1b. Push from your laptop

In Terminal, inside the project folder:

```bash
# Initialise git (first time only)
git init -b main

# Stage everything except what's in .gitignore
git add .

# Double-check nothing secret got staged. You should see NO lines
# mentioning .env.local, credentials/, or google-service-account.json.
git status

# First commit
git commit -m "Initial commit"

# Link to the GitHub repo you just created
git remote add origin https://github.com/<you>/ibn-marketing-dashboard.git

# Push to GitHub
git push -u origin main
```

GitHub may prompt for a password — use a **personal access token**, not
your GitHub password. If you haven't got one:
GitHub → Settings → Developer settings → Personal access tokens →
Tokens (classic) → Generate new token (classic) → tick the `repo`
scope → copy the token and paste it when prompted.

Refresh the GitHub repo page — your files should be there. Confirm
there is NO `.env.local` and NO `credentials/` folder visible. If there
is, stop and fix that before continuing (see "If you accidentally
pushed a secret" at the bottom).

---

## Step 2 — Import the repo into Vercel

1. Go to <https://vercel.com/new>
2. Pick the GitHub account that owns the new repo (you may need to
   click "Add GitHub Account" or "Adjust GitHub App Permissions" so
   Vercel can see the new private repo)
3. Find `ibn-marketing-dashboard` in the list → **Import**
4. On the "Configure Project" screen:
   - **Framework Preset:** Next.js (auto-detected — leave as-is)
   - **Root Directory:** leave blank (the project is at the repo root)
   - **Build and Output Settings:** leave as defaults
5. **Do NOT click Deploy yet** — expand the **Environment Variables**
   section first (next step).

---

## Step 3 — Paste environment variables into Vercel

Still on the Configure Project screen, in the **Environment Variables**
section, add each of the following. For each one, paste the name into
the "Key" field and the value into "Value", then click **Add**. Leave
the environment dropdown on "All Environments" (Production, Preview,
and Development).

### Required

| Key | Value |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Paste the **entire contents** of your `credentials/google-service-account.json` file. See note below. |
| `WIP_SHEET_ID` | `1tn3DkH8LxF4xTFEOrEeET1WNu1KOZimRMVfXXyYTfII` |
| `WIP_SHEET_RANGE` | `'WIP - Consolidated'!A1:T1000` |
| `WIP_SHEET_STATUS_VALUES` | `Live` |
| `META_SPEND_SHEET_RANGE` | `'Data - Spend - IBN/HS'!A1:AZ50000` |
| `META_SPEND_BRAND_FILTER` | `IBuildNew,Homeshelf` |
| `REFERRALS_SHEET_ID` | `1qyJZrUF8yFjdgBkSAKVGEFDIy7NdyzjfOxVrRLZL-Bo` |
| `REFERRALS_SHEET_RANGE` | `'All Contacts'!A1:AS100000` |
| `USE_MOCK_DATA` | `false` |
| `CURRENCY` | `AUD` |
| `LOCALE` | `en-AU` |

### Pasting the service-account JSON

This is the only tricky one. Open the file at
`credentials/google-service-account.json` in a text editor, select
everything (Cmd+A), copy, and paste as the value for
`GOOGLE_SERVICE_ACCOUNT_JSON`. Vercel handles the multi-line `private_key`
correctly — do NOT try to escape newlines or wrap the value in extra
quotes.

### Optional — only if you plan to use them

Pipedrive is currently dormant (leads come from Meta, referrals come
from the sheet), so these aren't needed to deploy. Add them later if
you reactivate Pipedrive.

```
PIPEDRIVE_API_TOKEN
PIPEDRIVE_DOMAIN
PIPEDRIVE_LEAD_STAGE_IDS
PIPEDRIVE_REFERRAL_STAGE_IDS
PIPEDRIVE_JOB_NUMBER_FIELD
PIPEDRIVE_CAMPAIGN_FIELD
```

---

## Step 4 — Deploy

Click **Deploy**. Vercel will install dependencies, run `next build`,
and push the app live. First build takes 1–3 minutes.

When it finishes you'll get a URL like
`ibn-marketing-dashboard-xyz.vercel.app`. Open it and confirm:

- The seven KPI tiles render with real numbers (not all zeros)
- The source badges at the top all say "live" (not "mock")
- Visit `/api/health` directly in the URL bar — should show all
  integrations as `configured`

If the page 500s, open the Vercel dashboard → your project → **Logs**
and look for the first red error. The most common deploy-time failure
is a typo in `GOOGLE_SERVICE_ACCOUNT_JSON` (missing brace, missing
comma). Paste it again from scratch if the log mentions `JSON.parse`.

---

## Step 5 — Lock it down with Password Protection

This is the part that requires Vercel Pro.

1. Vercel dashboard → your project → **Settings** → **Deployment Protection**
2. Enable **Password Protection**
3. Pick a strong password, save it
4. Toggle "Apply to Production" ON (and Preview too, so
   branch-preview deploys are also gated)

Anyone visiting the URL now sees a Vercel-branded password prompt
before the dashboard. Share the URL and the password with the
marketing team separately (password in 1Password, Slack DM, or
similar — not in the same message as the URL).

---

## Step 6 — Set up automatic redeploys (already done)

Because Vercel is linked to the GitHub repo, any push to the `main`
branch triggers a fresh production build automatically. You don't need
to do anything here.

To make a change later:

```bash
# Edit files locally, test with `npm run dev`, then:
git add .
git commit -m "Brief description of the change"
git push
```

Vercel picks it up within 10–20 seconds, builds, and swaps the new
version in. You'll get an email when the build finishes.

---

## Custom domain (optional — do later)

If you want a URL like `dashboard.ibuildnew.com.au`:

1. Vercel dashboard → your project → **Settings** → **Domains**
2. Enter `dashboard.ibuildnew.com.au` → **Add**
3. Vercel shows the DNS record you need to add (a `CNAME` pointing to
   `cname.vercel-dns.com`). Give this to whoever manages the
   `ibuildnew.com.au` DNS
4. Once the record propagates, Vercel issues an SSL cert automatically

---

## Troubleshooting

**All tiles show mock data after deploy.**
Open `/api/health` on the live URL. Whichever integration says "mock"
is missing an env var. Double-check the env vars in Vercel → Settings
→ Environment Variables, and ensure they apply to **Production** (not
just Preview/Development). If you change any env var you must trigger
a new deploy (Vercel → Deployments → ⋯ menu → "Redeploy").

**Build fails with `JSON.parse` error.**
`GOOGLE_SERVICE_ACCOUNT_JSON` is malformed. The safest fix is to open
the credentials JSON file in VS Code or another editor that won't
strip anything, Cmd+A, copy, paste into Vercel again. Don't add
quotes around it.

**Referrals tile shows 0.**
The service account needs Viewer access on the referrals spreadsheet
separately — sharing the WIP sheet doesn't automatically share the
referrals sheet. Open the referrals sheet → Share → paste the
`client_email` from the service-account JSON → Viewer → Send.

**I changed an env var but the dashboard still shows the old value.**
Env var changes require a redeploy. Vercel → Deployments → latest
deployment → ⋯ → Redeploy.

---

## If you accidentally pushed a secret

If a service-account key or `.env.local` ends up on GitHub (even for
a moment) you must:

1. **Revoke the key immediately** in Google Cloud Console → IAM &
   Admin → Service Accounts → your account → Keys → delete the
   exposed key, create a new one
2. Save the new key as `./credentials/google-service-account.json`
   locally
3. Paste the new JSON into Vercel's `GOOGLE_SERVICE_ACCOUNT_JSON` env
   var, redeploy
4. Share the new key with anyone else who runs the dashboard locally

Leaked Google service-account keys should be assumed compromised —
simply deleting the file from git is not enough because git history
remembers it.
