/**
 * Leads Master sheet reader.
 *
 * The sheet captures actual website lead form fills with UTM tags. Each
 * row is one lead. We use it on the Website Performance tab to get a
 * truer Leads count and Conversion Rate than Meta's pixel-tracked
 * count (column AJ on the spend sheet), because a fair share of website
 * leads never fire the Meta conversion event.
 *
 * Sheet schema (confirmed with Brendon 2026-05-04):
 *   Sheet ID:   process.env.LEADS_SHEET_ID
 *   Tab name:   "Leads Master - DB"
 *   Columns:
 *     A  → Created Date
 *     B  → Builder ID
 *     C  → Builder Name
 *     D  → Home Build (State)
 *     K  → Campaign Type      (filter: "Website")
 *     X  → Traffic Channel
 *     Y  → Source              (filter: Facebook / Meta only)
 *     AA → Paid                (filter: paid only)
 *     AB → Campaign            (the utm_campaign value, used for matching)
 *
 * The default range is wide enough to absorb any new columns added to
 * the right of AB without breaking the reader. Override via env if the
 * tab gets renamed.
 *
 * Falls back to mock data when the env isn't configured.
 */

import { readSheetRange, hasGoogleCredentials } from "./sheets";
import { MOCK_LEADS } from "./mockData";

const DEFAULT_RANGE = "'Leads Master - DB'!A1:AZ50000";

// Spreadsheet column letters → zero-based index. A=0, K=10, X=23, Y=24,
// AA=26, AB=27.
const COL = {
  CREATED_DATE: 0, // A
  BUILDER_ID: 1, // B
  BUILDER_NAME: 2, // C
  STATE: 3, // D
  CAMPAIGN_TYPE: 10, // K
  TRAFFIC_CHANNEL: 23, // X
  SOURCE: 24, // Y
  PAID: 26, // AA
  CAMPAIGN: 27, // AB
};

// Filter dictionaries — case-insensitive matches. Configurable via env
// in case the team's value spelling drifts (e.g. "FB" vs "Facebook").
const DEFAULT_PAID_VALUES = ["yes", "y", "true", "1", "paid"];
const DEFAULT_SOURCE_VALUES = ["facebook", "meta", "fb", "instagram", "ig"];
const DEFAULT_CAMPAIGN_TYPE_VALUES = ["website"];

let _leadsLoggedOnce = false;

function shouldUseLeadsMock() {
  if (process.env.USE_MOCK_DATA === "true") return true;
  if (!process.env.LEADS_SHEET_ID) return true;
  return !hasGoogleCredentials();
}

function envValues(envVar, defaults) {
  const raw = process.env[envVar];
  if (!raw) return defaults;
  return String(raw)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Fetch lead rows from the Leads Master sheet within the given date range.
 *
 * @param {{ since?: string, until?: string }} opts  yyyy-mm-dd range bounds (inclusive)
 * @returns {Promise<{ source: "live" | "mock", leads: Array<{...}> }>}
 *
 * Each lead object: { createdDate, builderId, builderName, state,
 *                     campaignType, source, paid, utmCampaign }
 */
export async function fetchLeads({ since, until } = {}) {
  if (shouldUseLeadsMock()) {
    const filtered = MOCK_LEADS.filter((l) =>
      withinRange(l.createdDate, since, until)
    );
    return { source: "mock", leads: filtered };
  }

  const range = process.env.LEADS_SHEET_RANGE || DEFAULT_RANGE;
  const rows = await readSheetRange(range, process.env.LEADS_SHEET_ID);

  if (!_leadsLoggedOnce) {
    _leadsLoggedOnce = true;
    // eslint-disable-next-line no-console
    console.log(
      "[leads] read %d rows from leads sheet (range=%s)",
      rows.length,
      range
    );
  }

  if (rows.length < 2) {
    return { source: "live", leads: [] };
  }

  const paidValues = envValues("LEADS_SHEET_PAID_VALUES", DEFAULT_PAID_VALUES);
  const sourceValues = envValues(
    "LEADS_SHEET_SOURCE_VALUES",
    DEFAULT_SOURCE_VALUES
  );
  const campaignTypeValues = envValues(
    "LEADS_SHEET_CAMPAIGN_TYPE_VALUES",
    DEFAULT_CAMPAIGN_TYPE_VALUES
  );

  const leads = [];
  // Skip header row. Bail on rows with no Created Date or no Campaign
  // value — those are usually empty trailing rows in the sheet.
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i] || [];

    const createdDate = normaliseDate(r[COL.CREATED_DATE]);
    if (!createdDate) continue;
    if (!withinRange(createdDate, since, until)) continue;

    const utmCampaign = String(r[COL.CAMPAIGN] || "").trim();
    if (!utmCampaign) continue;

    const sourceVal = String(r[COL.SOURCE] || "").trim().toLowerCase();
    if (sourceValues.length > 0 && !sourceValues.includes(sourceVal)) {
      continue;
    }

    const paidVal = String(r[COL.PAID] || "").trim().toLowerCase();
    if (paidValues.length > 0 && !paidValues.includes(paidVal)) {
      continue;
    }

    const campaignTypeVal = String(r[COL.CAMPAIGN_TYPE] || "")
      .trim()
      .toLowerCase();
    if (
      campaignTypeValues.length > 0 &&
      !campaignTypeValues.includes(campaignTypeVal)
    ) {
      continue;
    }

    leads.push({
      createdDate,
      builderId: String(r[COL.BUILDER_ID] || "").trim(),
      builderName: String(r[COL.BUILDER_NAME] || "").trim(),
      state: String(r[COL.STATE] || "").trim(),
      campaignType: campaignTypeVal,
      source: sourceVal,
      paid: paidVal,
      utmCampaign,
    });
  }

  return { source: "live", leads };
}

/**
 * Coerce a sheet date cell into yyyy-mm-dd. Mirrors meta.js — accepts
 * ISO, Australian dd/mm/yyyy, and the yyyy-mm month-only format (treats
 * as start-of-month). Returns null on anything unparseable.
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
