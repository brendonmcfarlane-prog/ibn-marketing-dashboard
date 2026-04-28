/**
 * Meta Ads spend reader — from Google Sheet instead of the Meta API.
 *
 * Brendon's team already has a daily-refreshed export landing on a tab
 * in the same WIP spreadsheet (`Data - Spend - IBN/HS`). Reading it
 * directly avoids the whole Meta System User token dance and reuses the
 * single Google service account set up for the WIP reader.
 *
 * Grain of the source tab: one row per (ad set, campaign, date).
 * We aggregate up to campaign level for the selected date range
 * because the dashboard's aggregator expects one row per campaign.
 *
 * Expected headers (first row of the sheet — case-insensitive, tolerant
 * of whitespace):
 *   "Report: Date"              → date
 *   "Campaign: Campaign Id"     → campaignId
 *   "Campaign: Campaign name"   → campaignName
 *   "Cost: Amount spend"        → spend
 *   "Performance: Clicks"       → clicks
 *   "Performance: Impressions"  → impressions
 *   "Job Number"                → jobNumber (pre-populated in sheet)
 *   "Homeshelf/IBuildNew"       → brand (optional filter source)
 *   Column AJ                   → leads (per-row count of on-platform leads
 *                                  — Brendon confirmed column AJ 2026-04-23.
 *                                  Header-name fallback tries common label
 *                                  variants, letter fallback kicks in last).
 *
 * Falls back to mock data when env is not configured. If you ever
 * need to swap back to the direct Meta API, the previous implementation
 * is preserved in `meta.api.js.bak`.
 */

import { readSheetRange, shouldUseSheetsMock } from "./sheets";
import { MOCK_META_CAMPAIGNS } from "./mockData";
import { classifyAdType } from "./adType";

const DEFAULT_RANGE = "'Data - Spend - IBN/HS'!A1:AZ50000";

let _metaLoggedOnce = false;

function shouldUseMock() {
  if (shouldUseSheetsMock()) return true;
  return false;
}

/**
 * Fetch campaign-level Meta spend for the given date range.
 * Returns a normalised list: [{ campaignId, campaignName, jobNumber, platform, spend, impressions, clicks }]
 */
export async function fetchMetaCampaigns({ since, until } = {}) {
  if (shouldUseMock()) {
    // Mock data was authored before adType existed — derive it on the way
    // out so mock + live paths return the same shape.
    const tagged = MOCK_META_CAMPAIGNS.map((c) => ({
      ...c,
      adType: c.adType || classifyAdType(c.campaignName),
    }));
    return { source: "mock", campaigns: tagged };
  }

  const range = process.env.META_SPEND_SHEET_RANGE || DEFAULT_RANGE;
  const rows = await readSheetRange(range);

  if (rows.length < 2) {
    return { source: "live", campaigns: [] };
  }

  const headers = rows[0].map((h) => String(h || "").trim().toLowerCase());
  const idxDate = findHeader(headers, [
    "report: date",
    "date formatted",
    "date",
  ]);
  const idxCampaignId = findHeader(headers, [
    "campaign: campaign id",
    "campaign id",
    "campaignid",
  ]);
  const idxCampaignName = findHeader(headers, [
    "campaign: campaign name",
    "campaign name",
    "campaignname",
  ]);
  const idxSpend = findHeader(headers, [
    "cost: amount spend",
    "cost: amount spent",
    "spend",
    "amount spent",
    "amount spend",
  ]);
  const idxClicks = findHeader(headers, [
    "performance: clicks",
    "clicks",
  ]);
  const idxImpressions = findHeader(headers, [
    "performance: impressions",
    "impressions",
  ]);
  const idxJob = findHeader(headers, [
    "job number",
    "jobnumber",
    "job #",
    "job",
  ]);
  const idxBrand = findHeader(headers, [
    "homeshelf/ibuildnew",
    "brand",
    "product",
  ]);
  // Leads: try header-name matches common across Meta exports, then fall
  // back to column AJ (index 35) — the position Brendon confirmed.
  const AJ_INDEX = 35; // A=0 so AJ = 26+9 = 35
  let idxLeads = findHeader(headers, [
    "performance: leads",
    "metric: leads",
    "on-facebook leads",
    "on facebook leads",
    "leads",
    "results",
  ]);
  if (idxLeads < 0 && AJ_INDEX < headers.length) {
    idxLeads = AJ_INDEX;
  }

  if (!_metaLoggedOnce) {
    _metaLoggedOnce = true;
    // eslint-disable-next-line no-console
    console.log(
      "[meta] leads column → index=%d header=%s",
      idxLeads,
      idxLeads >= 0 ? headers[idxLeads] : "(none)"
    );
  }

  // Optional brand filter — accepts a comma-separated list of brand
  // values that should be INCLUDED. Leave blank to include every row.
  // Matches case-insensitively against the "Homeshelf/IBuildNew" column.
  const brandFilter = parseBrandFilter(process.env.META_SPEND_BRAND_FILTER);

  // Aggregate rows (one per adset-day) up to campaign level across the
  // date range. Map key = campaignId.
  const byCampaign = new Map();

  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i] || [];
    const dateIso = idxDate >= 0 ? normaliseDate(r[idxDate]) : null;
    if (!withinRange(dateIso, since, until)) continue;

    if (idxBrand >= 0 && brandFilter.length > 0) {
      const b = String(r[idxBrand] || "").trim().toLowerCase();
      if (!brandFilter.includes(b)) continue;
    }

    const campaignId = idxCampaignId >= 0 ? String(r[idxCampaignId] || "").trim() : "";
    if (!campaignId) continue;

    const campaignName =
      idxCampaignName >= 0 ? String(r[idxCampaignName] || "").trim() : "";

    // Prefer the Job Number column when populated; otherwise parse the
    // campaign name prefix. Real-world sheet exports sometimes drop the
    // Job Number cell for recent campaigns, so this fallback is load-
    // bearing for attribution.
    const jobFromColumn =
      idxJob >= 0 ? normaliseJobNumber(r[idxJob]) : null;
    const jobFromName = extractJobNumberFromName(campaignName);

    const existing = byCampaign.get(campaignId) || {
      campaignId,
      campaignName: campaignName || campaignId,
      jobNumber: jobFromColumn || jobFromName || null,
      platform: "meta",
      // Ad type is derived from the campaign name (contains "Website" =
      // Website, anything else = Lead Ads). See src/lib/adType.js.
      adType: classifyAdType(campaignName || campaignId),
      spend: 0,
      impressions: 0,
      clicks: 0,
      leads: 0,
    };

    existing.spend += parseNumber(r[idxSpend]);
    existing.impressions += parseNumber(r[idxImpressions]);
    existing.clicks += parseNumber(r[idxClicks]);
    existing.leads += idxLeads >= 0 ? parseNumber(r[idxLeads]) : 0;
    // Job number / campaign name can appear blank on some rows in a
    // series — keep the first non-blank value we see for the campaign.
    if (!existing.jobNumber) {
      existing.jobNumber = jobFromColumn || jobFromName || null;
    }
    if (!existing.campaignName && campaignName) {
      existing.campaignName = campaignName;
      // Reclassify now that we have the real name — earlier rows in the
      // same campaign block may have left it blank, defaulting to Lead
      // Ads, when the name actually carries a "Website" token.
      existing.adType = classifyAdType(campaignName);
    }

    byCampaign.set(campaignId, existing);
  }

  return { source: "live", campaigns: Array.from(byCampaign.values()) };
}

function parseBrandFilter(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function findHeader(headers, candidates) {
  for (const cand of candidates) {
    const idx = headers.indexOf(cand.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseNumber(v) {
  if (v === null || v === undefined || v === "") return 0;
  const s = String(v).replace(/[$,\s]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Coerce a sheet date cell into yyyy-mm-dd. Accepts ISO, Australian
 * dd/mm/yyyy, and the tab's "Date formatted" yyyy-mm format (treated
 * as start-of-month).
 */
function normaliseDate(v) {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const auMatch = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (auMatch) {
    const [, dd, mm, yy] = auMatch;
    const year = yy.length === 2 ? `20${yy}` : yy;
    return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function withinRange(dateIso, since, until) {
  if (!dateIso) return false;
  if (since && dateIso < since) return false;
  if (until && dateIso > until) return false;
  return true;
}

function normaliseJobNumber(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

/**
 * Extract a Job Number from the campaign name. Fallback when the
 * sheet's Job Number column is blank for that row.
 *
 * IBN / Homeshelf naming convention (as seen in the WIP sheet):
 *   - Letter prefix (HS, SG, IBN, etc.) + digits, e.g. HS524, SG09800, IBN2145
 *   - Optionally followed by a bracketed suffix separating campaign type
 *     (e.g. HS424 [1], SG09800 [G][C], SG09800 [LA], SG09800 [YT])
 *   - Typically sits at the start of the campaign name, followed by a
 *     delimiter (" - ", " | ", etc.)
 *
 * Examples that should match:
 *   "SG09800 [LA] - Homeshelf Lead Ads (VIC)"   → "SG09800 [LA]"
 *   "HS524 - Davidson Building Group"           → "HS524"
 *   "HS424 [1] | Long Island Homes Geelong"     → "HS424 [1]"
 *   "IBN-2145_Carlisle_Prospecting_VIC"         → "IBN-2145"
 */
export function extractJobNumberFromName(campaignName = "") {
  const s = String(campaignName).trim();
  if (!s) return null;

  // Pattern: letter prefix + digits, optionally followed by " [...]"
  // bracket groups (one or more, to handle SG09800 [G][C] shape).
  const match = s.match(
    /^([A-Z]{2,4}[-_]?\d{2,6}(?:\s*\[[^\]]+\])*)/i
  );
  if (!match) return null;

  // Normalise whitespace inside the job number (collapse multiple
  // spaces, trim around brackets) so "SG09800  [LA]" → "SG09800 [LA]".
  return match[1].replace(/\s+/g, " ").replace(/\s*\[/g, " [").trim();
}

/**
 * Legacy alias — earlier code imported this name. Keep the export so
 * any lingering reference doesn't break. Delegates to the new function.
 */
export function extractJobNumber(campaignName = "") {
  return extractJobNumberFromName(campaignName);
}
