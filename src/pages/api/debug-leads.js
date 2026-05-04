import { readSheetRange, hasGoogleCredentials } from "@/lib/sheets";
import { matchLeadToCampaign } from "@/lib/campaignMatch";
import { fetchMetaCampaigns } from "@/lib/meta";
import { AD_TYPE_WEBSITE } from "@/lib/adType";
import { daysAgoIso, todayIso } from "@/lib/format";

const DEFAULT_RANGE = "'Leads Master - DB'!A1:AZ50000";
const COL = { CREATED_DATE: 0, BUILDER_ID: 1, BUILDER_NAME: 2, STATE: 3, CAMPAIGN_TYPE: 10, TRAFFIC_CHANNEL: 23, SOURCE: 24, PAID: 26, CAMPAIGN: 27 };
const DEFAULT_PAID = ["yes", "y", "true", "1", "paid"];
const DEFAULT_SOURCE = ["facebook", "meta", "fb", "instagram", "ig"];
const DEFAULT_CAMPAIGN_TYPE = ["website"];

export default async function handler(req, res) {
  try {
    const since = isValidDate(req.query.since) ? req.query.since : daysAgoIso(29);
    const until = isValidDate(req.query.until) ? req.query.until : todayIso();
    if (!process.env.LEADS_SHEET_ID) return res.status(200).json({ ok: false, reason: "LEADS_SHEET_ID env var is not set" });
    if (!hasGoogleCredentials()) return res.status(200).json({ ok: false, reason: "Google service-account credentials are not available" });
    const range = process.env.LEADS_SHEET_RANGE || DEFAULT_RANGE;
    let rows;
    try { rows = await readSheetRange(range, process.env.LEADS_SHEET_ID); }
    catch (err) { return res.status(200).json({ ok: false, reason: "Sheet read failed", message: err.message, hint: err.message && err.message.toLowerCase().includes("permission") ? "Share the Leads Master sheet with the service-account email (Viewer)." : "Check LEADS_SHEET_ID and LEADS_SHEET_RANGE." }); }
    const dataRows = rows.slice(1);
    const sample = dataRows.slice(0, 5).map((r) => ({ A_createdDate: cell(r, COL.CREATED_DATE), B_builderId: cell(r, COL.BUILDER_ID), C_builderName: cell(r, COL.BUILDER_NAME), D_state: cell(r, COL.STATE), K_campaignType: cell(r, COL.CAMPAIGN_TYPE), X_trafficChannel: cell(r, COL.TRAFFIC_CHANNEL), Y_source: cell(r, COL.SOURCE), AA_paid: cell(r, COL.PAID), AB_campaign: cell(r, COL.CAMPAIGN) }));
    const distinct = { K_campaignType: distinctCounts(dataRows, COL.CAMPAIGN_TYPE), Y_source: distinctCounts(dataRows, COL.SOURCE), AA_paid: distinctCounts(dataRows, COL.PAID) };
    const stages = [{ stage: "raw rows (excluding header)", remaining: dataRows.length }];
    let afterDate = 0, afterCampaign = 0, afterSource = 0, afterPaid = 0, afterCampaignType = 0;
    for (const r of dataRows) {
      const created = normaliseDate(cell(r, COL.CREATED_DATE));
      if (!created || (since && created < since) || (until && created > until)) continue;
      afterDate += 1;
      const utm = cell(r, COL.CAMPAIGN).trim();
      if (!utm) continue;
      afterCampaign += 1;
      const sv = cell(r, COL.SOURCE).trim().toLowerCase();
      if (!DEFAULT_SOURCE.includes(sv)) continue;
      afterSource += 1;
      const pv = cell(r, COL.PAID).trim().toLowerCase();
      if (!DEFAULT_PAID.includes(pv)) continue;
      afterPaid += 1;
      const ct = cell(r, COL.CAMPAIGN_TYPE).trim().toLowerCase();
      if (!DEFAULT_CAMPAIGN_TYPE.includes(ct)) continue;
      afterCampaignType += 1;
    }
    stages.push({ stage: `within date range (${since} to ${until})`, remaining: afterDate }, { stage: "non-empty Campaign (AB)", remaining: afterCampaign }, { stage: `Source (Y) in {${DEFAULT_SOURCE.join(", ")}}`, remaining: afterSource }, { stage: `Paid (AA) in {${DEFAULT_PAID.join(", ")}}`, remaining: afterPaid }, { stage: `Campaign Type (K) in {${DEFAULT_CAMPAIGN_TYPE.join(", ")}}`, remaining: afterCampaignType });
    let matched = 0;
    let unmatchedExamples = [];
    if (afterCampaignType > 0) {
      const metaResult = await fetchMetaCampaigns({ since, until });
      const websiteCampaigns = metaResult.campaigns.filter((c) => c.adType === AD_TYPE_WEBSITE);
      for (const r of dataRows) {
        const created = normaliseDate(cell(r, COL.CREATED_DATE));
        if (!created || (since && created < since) || (until && created > until)) continue;
        const utm = cell(r, COL.CAMPAIGN).trim();
        if (!utm) continue;
        const sv = cell(r, COL.SOURCE).trim().toLowerCase();
        if (!DEFAULT_SOURCE.includes(sv)) continue;
        const pv = cell(r, COL.PAID).trim().toLowerCase();
        if (!DEFAULT_PAID.includes(pv)) continue;
        const ct = cell(r, COL.CAMPAIGN_TYPE).trim().toLowerCase();
        if (!DEFAULT_CAMPAIGN_TYPE.includes(ct)) continue;
        const m = matchLeadToCampaign(utm, websiteCampaigns);
        if (m) matched += 1;
        else if (unmatchedExamples.length < 5) unmatchedExamples.push(utm);
      }
      stages.push({ stage: "matched to a Website Meta campaign by suffix", remaining: matched });
    }
    return res.status(200).json({ ok: true, range: { since, until }, sheet: { sheetId: process.env.LEADS_SHEET_ID, range, totalRowsIncludingHeader: rows.length }, sample, distinctValues: distinct, filterStages: stages, unmatchedSamples: unmatchedExamples, defaults: { paidValues: DEFAULT_PAID, sourceValues: DEFAULT_SOURCE, campaignTypeValues: DEFAULT_CAMPAIGN_TYPE } });
  } catch (err) {
    console.error("[api/debug-leads]", err);
    res.status(500).json({ error: err.message || "Unknown error" });
  }
}

function cell(r, idx) { if (!r || idx >= r.length) return ""; return String(r[idx] ?? ""); }
function distinctCounts(rows, idx) { const c = new Map(); for (const r of rows) { const v = cell(r, idx).trim(); if (!v) continue; c.set(v, (c.get(v) || 0) + 1); } return Array.from(c.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([value, count]) => ({ value, count })); }
function normaliseDate(s) { if (!s) return null; const v = String(s).trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; const au = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/); if (au) { const [, dd, mm, yy] = au; const year = yy.length === 2 ? `20${yy}` : yy; return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`; } if (/^\d{4}-\d{2}$/.test(v)) return `${v}-01`; const d = new Date(v); if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10); return null; }
function isValidDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
