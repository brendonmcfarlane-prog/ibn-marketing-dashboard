import { fetchMetaCampaigns } from "@/lib/meta";
import { fetchLeads } from "@/lib/leadsSheet";
import { matchLeadToCampaign } from "@/lib/campaignMatch";
import { AD_TYPE_WEBSITE } from "@/lib/adType";
import { daysAgoIso, todayIso, safeDivide } from "@/lib/format";

export default async function handler(req, res) {
  try {
    const since = isValidDate(req.query.since) ? req.query.since : daysAgoIso(29);
    const until = isValidDate(req.query.until) ? req.query.until : todayIso();
    const [metaResult, leadsResult] = await Promise.all([
      fetchMetaCampaigns({ since, until }),
      fetchLeads({ since, until }),
    ]);
    const websiteCampaigns = metaResult.campaigns.filter((c) => c.adType === AD_TYPE_WEBSITE);
    const leadCounts = new Map();
    let unmatched = 0;
    for (const lead of leadsResult.leads) {
      const m = matchLeadToCampaign(lead.utmCampaign, websiteCampaigns);
      if (m) leadCounts.set(m.campaignId, (leadCounts.get(m.campaignId) || 0) + 1);
      else unmatched += 1;
    }
    const campaigns = websiteCampaigns.map((c) => {
      const leads = leadCounts.get(c.campaignId) || 0;
      const spend = Number(c.spend) || 0;
      const clicks = Number(c.clicks) || 0;
      return { campaignId: c.campaignId, campaignName: c.campaignName, jobNumber: c.jobNumber, spend, clicks, impressions: Number(c.impressions) || 0, leads, costPerLead: safeDivide(spend, leads), conversionRate: safeDivide(leads, clicks) };
    });
    const totalSpend = sum(campaigns.map((c) => c.spend));
    const totalClicks = sum(campaigns.map((c) => c.clicks));
    const totalLeads = sum(campaigns.map((c) => c.leads));
    res.status(200).json({ range: { since, until }, sources: { meta: metaResult.source, leads: leadsResult.source }, totals: { spend: totalSpend, clicks: totalClicks, leads: totalLeads, costPerLead: safeDivide(totalSpend, totalLeads), conversionRate: safeDivide(totalLeads, totalClicks), campaignCount: campaigns.length, unmatchedLeads: unmatched, leadsConsidered: leadsResult.leads.length }, campaigns: campaigns.sort((a, b) => b.spend - a.spend) });
  } catch (err) {
    console.error("[api/website-performance]", err);
    res.status(500).json({ error: err.message || "Unknown error" });
  }
}
function sum(arr) { return arr.reduce((acc, n) => acc + (Number(n) || 0), 0); }
function isValidDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
