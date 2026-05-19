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
  MEDIUM: 25,
  PAID: 26,
  CAMPAIGN: 27,
};

let _leadsLoggedOnce = false;

function shouldUseLeadsMock() {
  if (process.env.USE_MOCK_DATA === "true") return true;
  if (!process.env.LEADS_SHEET_ID) return true;
  return !hasGoogleCredentials();
}

/**
 * Channel classification per Brendon's spec (2026-05-17):
 *   Meta Ads paid:    Traffic Channel = "Paid Social",  Source ∈ {fb, ig},  Medium = "paid"
 *   Google Ads paid:  Traffic Channel = "Paid Search",  Source = "google",  Medium ∈ {paid, cpc}
 *
 * Returns "meta", "google", or null for anything else (organic, direct, email,
 * referral, blank, etc.). Non-paid leads are still returned by fetchLeads —
 * consumer can filter as needed. Used for channel-aware lead-to-campaign
 * matching on the dashboard's per-campaign Leads column.
 */
export function classifyLeadChannel(trafficChannel, source, medium) {
  const tc = String(trafficChannel || "").trim().toLowerCase();
  const sv = String(source || "").trim().toLowerCase();
  const mv = String(medium || "").trim().toLowerCase();
  if (tc === "paid social" && (sv === "fb" || sv === "ig") && mv === "paid") return "meta";
  if (tc === "paid search" && sv === "google" && (mv === "paid" || mv === "cpc")) return "google";
  return null;
}

export async function fetchLeads({ since, until } = {}) {
  if (shouldUseLeadsMock()) {
    const filtered = MOCK_LEADS
      .filter((l) => withinRange(l.createdDate, since, until))
      .map((l) => ({ ...l, channel: l.channel || "meta" }));
    return { source: "mock", leads: filtered };
  }

  const range = process.env.LEADS_SHEET_RANGE || DEFAULT_RANGE;
  const rows = await readSheetRange(range, process.env.LEADS_SHEET_ID);

  if (!_leadsLoggedOnce) {
    _leadsLoggedOnce = true;
    console.log("[leads] read %d rows (range=%s)", rows.length, range);
  }
  if (rows.length < 2) return { source: "live", leads: [] };

  const leads = [];
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i] || [];
    const createdDate = normaliseDate(r[COL.CREATED_DATE]);
    if (!createdDate) continue;
    if (!withinRange(createdDate, since, until)) continue;

    const trafficChannel = String(r[COL.TRAFFIC_CHANNEL] || "").trim();
    const source = String(r[COL.SOURCE] || "").trim();
    const medium = String(r[COL.MEDIUM] || "").trim();
    const channel = classifyLeadChannel(trafficChannel, source, medium); // may be null

    leads.push({
      createdDate,
      builderId: String(r[COL.BUILDER_ID] || "").trim(),
      builderName: String(r[COL.BUILDER_NAME] || "").trim(),
      state: String(r[COL.STATE] || "").trim(),
      campaignType: String(r[COL.CAMPAIGN_TYPE] || "").trim().toLowerCase(),
      trafficChannel: trafficChannel.toLowerCase(),
      source: source.toLowerCase(),
      medium: medium.toLowerCase(),
      paid: String(r[COL.PAID] || "").trim().toLowerCase(),
      postCode: String(r[COL.POSTCODE] || "").trim(),
      utmCampaign: String(r[COL.CAMPAIGN] || "").trim(),
      channel,
    });
  }
  return { source: "live", leads };
}

function normaliseDate(v) {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const au = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (au) {
    const [, dd, mm, yy] = au;
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
