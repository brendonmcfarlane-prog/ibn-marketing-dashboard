import { fetchMetaCampaigns } from "@/lib/meta";
import { fetchLeads } from "@/lib/leadsSheet";
import { matchLeadToCampaign } from "@/lib/campaignMatch";
import { fetchBuilderPostcodeMap, countMatchesForPostcode } from "@/lib/builderPostcodes";
import { AD_TYPE_WEBSITE } from "@/lib/adType";
import { daysAgoIso, todayIso, safeDivide } from "@/lib/format";

export default async function handler(req, res) {
  try {
    const since = isValidDate(req.query.since) ? req.query.since : daysAgoIso(29);
    const until = isValidDate(req.query.until) ? req.query.until : todayIso();

    const [metaResult, leadsResult, postcodesResult] = await Promise.all([
      fetchMetaCampaigns({ since, until }),
      fetchLeads({ since, until }),
      fetchBuilderPostcodeMap().catch((e) => { console.error("[builder-postcodes]", e.message); return { source: "error", postcodeMap: new Map() }; }),
    ]);
    const websiteCampaigns = metaResult.campaigns.filter((c) => c.adType === AD_TYPE_WEBSITE);
    const postcodeMap = postcodesResult.postcodeMap || new Map();

    const leadCounts = new Map();
    const matchedSums = new Map();   // sum of cap-3 matches per campaign
    const matchedAny = new Map();    // count of leads with at least 1 match per campaign
    let unmatched = 0;
    let totalMatched = 0;
    let totalAnyMatched = 0;

    for (const lead of leadsResult.leads) {
      const m = matchLeadToCampaign(lead.utmCampaign, websiteCampaigns);
      if (!m) { unmatched += 1; continue; }
      leadCounts.set(m.campaignId, (leadCounts.get(m.campaignId) || 0) + 1);
      const matches = countMatchesForPostcode(postcodeMap, lead.postCode, 3);
      if (matches > 0) {
        matchedSums.set(m.campaignId, (matchedSums.get(m.campaignId) || 0) + matches);
        matchedAny.set(m.campaignId, (matchedAny.get(m.campaignId) || 0) + 1);
        totalMatched += matches;
        totalAnyMatched += 1;
      }
    }

    const campaigns = websiteCampaigns.map((c) => {
      const leads = leadCounts.get(c.campaignId) || 0;
      const matched = matchedSums.get(c.campaignId) || 0;
      const any = matchedAny.get(c.campaignId) || 0;
      const spend = Number(c.spend) || 0;
      const clicks = Number(c.clicks) || 0;
      return {
        campaignId: c.campaignId,
        campaignName: c.campaignName,
        jobNumber: c.jobNumber,
        spend, clicks,
        impressions: Number(c.impressions) || 0,
        leads,
        costPerLead: safeDivide(spend, leads),
        conversionRate: safeDivide(leads, clicks),
        matched,
        matchedAny: any,
        matchRate: safeDivide(any, leads),
      };
    });

    const totalSpend = sum(campaigns.map((c) => c.spend));
    const totalClicks = sum(campaigns.map((c) => c.clicks));
    const totalLeads = sum(campaigns.map((c) => c.leads));

    res.status(200).json({
      range: { since, until },
      sources: { meta: metaResult.source, leads: leadsResult.source, builderPostcodes: postcodesResult.source },
      totals: {
        spend: totalSpend,
        clicks: totalClicks,
        leads: totalLeads,
        costPerLead: safeDivide(totalSpend, totalLeads),
        conversionRate: safeDivide(totalLeads, totalClicks),
        campaignCount: campaigns.length,
        unmatchedLeads: unmatched,
        leadsConsidered: leadsResult.leads.length,
        matched: totalMatched,
        matchedAny: totalAnyMatched,
        matchRate: safeDivide(totalAnyMatched, totalLeads),
      },
      campaigns: campaigns.sort((a, b) => b.spend - a.spend),
    });
  } catch (err) {
    console.error("[api/website-performance]", err);
    res.status(500).json({ error: err.message || "Unknown error" });
  }
}

function sum(arr) { return arr.reduce((acc, n) => acc + (Number(n) || 0), 0); }
function isValidDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
