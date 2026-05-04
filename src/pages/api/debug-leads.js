import { readSheetRange, hasGoogleCredentials } from "@/lib/sheets";
import { matchLeadToCampaign } from "@/lib/campaignMatch";
import { fetchMetaCampaigns } from "@/lib/meta";
import { AD_TYPE_WEBSITE } from "@/lib/adType";
import { daysAgoIso, todayIso } from "@/lib/format";

const DEFAULT_RANGE = "'Leads Master - DB'!A1:AZ50000";
const COL = { CREATED_DATE: 0, BUILDER_ID: 1, BUILDER_NAME: 2, STATE: 3, CAMPAIGN_TYPE: 10, TRAFFIC_CHANNEL: 23, SOURCE: 24, PAID: 26, CAMPAIGN: 27 };
const PAID = ["yes", "y", "true", "1", "paid"];
const SOURCE = ["facebook", "meta", "fb", "instagram", "ig"];

export default async function handler(req, res) {
  try {
    const since = isValidDate(req.query.since) ? req.query.since : daysAgoIso(29);
    const until = isValidDate(req.query.until) ? req.query.until : todayIso();
    const q = (req.query.q || "").toString().trim().toLowerCase();
    if (!process.env.LEADS_SHEET_ID) return res.status(200).json({ ok: false, reason: "LEADS_SHEET_ID not set" });
    if (!hasGoogleCredentials()) return res.status(200).json({ ok: false, reason: "no Google credentials" });
    const range = process.env.LEADS_SHEET_RANGE || DEFAULT_RANGE;
    let rows;
    try { rows = await readSheetRange(range, process.env.LEADS_SHEET_ID); }
    catch (err) { return res.status(200).json({ ok: false, reason: "Sheet read failed", message: err.message }); }
    const dataRows = rows.slice(1);
    const metaResult = await fetchMetaCampaigns({ since, until });
    const websiteCampaigns = metaResult.campaigns.filter((c) => c.adType === AD_TYPE_WEBSITE);
    const allMetaCampaigns = metaResult.campaigns;

    const survivingLeads = [];
    for (const r of dataRows) {
      const created = normaliseDate(cell(r, COL.CREATED_DATE));
      if (!created || (since && created < since) || (until && created > until)) continue;
      const utm = cell(r, COL.CAMPAIGN).trim();
      if (!utm) continue;
      const sv = cell(r, COL.SOURCE).trim().toLowerCase();
      if (!SOURCE.includes(sv)) continue;
      const pv = cell(r, COL.PAID).trim().toLowerCase();
      if (!PAID.includes(pv)) continue;
      const m = matchLeadToCampaign(utm, websiteCampaigns);
      survivingLeads.push({
        createdDate: created,
        builderName: cell(r, COL.BUILDER_NAME),
        source: cell(r, COL.SOURCE),
        utm,
        matched: m ? m.campaignName : null,
        matchedAnyMeta: !!matchLeadToCampaign(utm, allMetaCampaigns),
      });
    }
    const unmatched = survivingLeads.filter((l) => !l.matched);

    const result = {
      ok: true,
      range: { since, until },
      totals: { surviving: survivingLeads.length, matched: survivingLeads.length - unmatched.length, unmatched: unmatched.length },
      unmatchedLeads: unmatched,
      websiteCampaignsInRange: websiteCampaigns.map((c) => c.campaignName),
    };

    if (q) {
      const qm = (s) => String(s || "").toLowerCase().includes(q);
      result.queryMatchesInSheet = survivingLeads.filter((l) => qm(l.utm) || qm(l.builderName));
      result.queryMatchesInAllCampaigns = allMetaCampaigns.filter((c) => qm(c.campaignName)).map((c) => ({ name: c.campaignName, adType: c.adType }));
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error("[api/debug-leads]", err);
    res.status(500).json({ error: err.message || "Unknown error" });
  }
}

function cell(r, idx) { if (!r || idx >= r.length) return ""; return String(r[idx] ?? ""); }
function normaliseDate(s) { if (!s) return null; const v = String(s).trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; const au = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/); if (au) { const [, dd, mm, yy] = au; const year = yy.length === 2 ? `20${yy}` : yy; return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`; } if (/^\d{4}-\d{2}$/.test(v)) return `${v}-01`; const d = new Date(v); if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10); return null; }
function isValidDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
