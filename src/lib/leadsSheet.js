import { readSheetRange, hasGoogleCredentials } from "./sheets";
import { MOCK_LEADS } from "./mockData";

const DEFAULT_RANGE = "'Leads Master - DB'!A1:AZ50000";

const COL = {
  CREATED_DATE: 0,
  BUILDER_ID: 1,
  BUILDER_NAME: 2,
  STATE: 3,
  CAMPAIGN_TYPE: 10,
  POSTCODE: 22,
  TRAFFIC_CHANNEL: 23,
  SOURCE: 24,
  PAID: 26,
  CAMPAIGN: 27,
};

const DEFAULT_PAID_VALUES = ["yes", "y", "true", "1", "paid"];
const DEFAULT_SOURCE_VALUES = ["facebook", "meta", "fb", "instagram", "ig"];
const DEFAULT_CAMPAIGN_TYPE_VALUES = [];

let _leadsLoggedOnce = false;

function shouldUseLeadsMock() {
  if (process.env.USE_MOCK_DATA === "true") return true;
  if (!process.env.LEADS_SHEET_ID) return true;
  return !hasGoogleCredentials();
}

function envValues(envVar, defaults) {
  const raw = process.env[envVar];
  if (!raw) return defaults;
  return String(raw).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export async function fetchLeads({ since, until } = {}) {
  if (shouldUseLeadsMock()) {
    const filtered = MOCK_LEADS.filter((l) => withinRange(l.createdDate, since, until));
    return { source: "mock", leads: filtered };
  }

  const range = process.env.LEADS_SHEET_RANGE || DEFAULT_RANGE;
  const rows = await readSheetRange(range, process.env.LEADS_SHEET_ID);

  if (!_leadsLoggedOnce) {
    _leadsLoggedOnce = true;
    console.log("[leads] read %d rows from leads sheet (range=%s)", rows.length, range);
  }
  if (rows.length < 2) return { source: "live", leads: [] };

  const paidValues = envValues("LEADS_SHEET_PAID_VALUES", DEFAULT_PAID_VALUES);
  const sourceValues = envValues("LEADS_SHEET_SOURCE_VALUES", DEFAULT_SOURCE_VALUES);
  const campaignTypeValues = envValues("LEADS_SHEET_CAMPAIGN_TYPE_VALUES", DEFAULT_CAMPAIGN_TYPE_VALUES);

  const leads = [];
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i] || [];
    const createdDate = normaliseDate(r[COL.CREATED_DATE]);
    if (!createdDate) continue;
    if (!withinRange(createdDate, since, until)) continue;

    const utmCampaign = String(r[COL.CAMPAIGN] || "").trim();
    if (!utmCampaign) continue;

    const sourceVal = String(r[COL.SOURCE] || "").trim().toLowerCase();
    if (sourceValues.length > 0 && !sourceValues.includes(sourceVal)) continue;

    const paidVal = String(r[COL.PAID] || "").trim().toLowerCase();
    if (paidValues.length > 0 && !paidValues.includes(paidVal)) continue;

    const campaignTypeVal = String(r[COL.CAMPAIGN_TYPE] || "").trim().toLowerCase();
    if (campaignTypeValues.length > 0 && !campaignTypeValues.includes(campaignTypeVal)) continue;

    leads.push({
      createdDate,
      builderId: String(r[COL.BUILDER_ID] || "").trim(),
      builderName: String(r[COL.BUILDER_NAME] || "").trim(),
      state: String(r[COL.STATE] || "").trim(),
      campaignType: campaignTypeVal,
      source: sourceVal,
      paid: paidVal,
      postCode: String(r[COL.POSTCODE] || "").trim(),
      utmCampaign,
    });
  }
  return { source: "live", leads };
}

function normaliseDate(v) {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const auMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (auMatch) {
    const [, dd, mm, yy] = auMatch;
    const year = yy.length === 2 ? `20${yy}` : yy;
    return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function withinRange(dateIso, since, until) {
  if (!dateIso) return false;
  if (since && dateIso < since) return false;
  if (until && dateIso > until) return false;
  return true;
}
