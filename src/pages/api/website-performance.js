import { fetchMetaCampaigns } from "@/lib/meta";
import { fetchLeads } from "@/lib/leadsSheet";
import { matchLeadToCampaign } from "@/lib/campaignMatch";
import { fetchBuilderPostcodeMap, countMatchesForPostcode, strictMatchForLead } from "@/lib/builderPostcodes";
import { fetchCurrentRevenuePerLead, lookupRpl } from "@/lib/performanceTracking";
import { AD_TYPE_WEBSITE } from "@/lib/adType";
import { daysAgoIso, todayIso, safeDivide } from "@/lib/format";

const FUTURE_RPL_MULTIPLIER = 1.3;

export default async function handler(req, res) {
  try {
    const since = isValidDate(req.query.since) ? req.query.since : daysAgoIso(29);
    const until = isValidDate(req.query.until) ? req.query.until : todayIso();

    const [metaResult, leadsResult, postcodesResult, rplResult] = await Promise.all([
      fetchMetaCampaigns({ since, until }),
      fetchLeads({ since, until }),
      fetchBuilderPostcodeMap().catch((e) => { console.error("[builder-postcodes]", e.message); return { source: "error", postcodeMap: new Map(), perBuilderMap: new Map() }; }),
      fetchCurrentRevenuePerLead().catch((e) => { console.error("[performance-tracking]", e.message); return { source: "error", rplMap: new Map() }; }),
    ]);

    const websiteCampaigns = metaResult.campaigns.filter((c) => c.adType === AD_TYPE_WEBSITE);
    const postcodeMap = postcodesResult.postcodeMap || new Map();
    const perBuilderMap = postcodesResult.perBuilderMap || new Map();
    const rplMap = rplResult.rplMap || new Map();

    // Only Meta-attributed paid leads for Meta Website campaigns. Google leads
    // (channel === "google") are reserved for the Google Ads side of the dashboard.
    const metaLeads = leadsResult.leads.filter((l) => l.channel === "meta");

    const leadCounts = new Map();
    const matchedSums = new Map();
    const matchedAny = new Map();
    const matchedStrict = new Map();
    let unmatched = 0, totalMatched = 0, totalAnyMatched = 0, totalStrict = 0;

    for (const lead of metaLeads) {
      const m = matchLeadToCampaign(lead.utmCampaign, websiteCampaigns);
      if (!m) { unmatched += 1; continue; }
      leadCounts.set(m.campaignId, (leadCounts.get(m.campaignId) || 0) + 1);
      const anyMatches = countMatchesForPostcode(postcodeMap, lead.postCode, 3);
      if (anyMatches > 0) {
        matchedSums.set(m.campaignId, (matchedSums.get(m.campaignId) || 0) + anyMatches);
        matchedAny.set(m.campaignId, (matchedAny.get(m.campaignId) || 0) + 1);
        totalMatched += anyMatches;
        totalAnyMatched += 1;
      }
      const strict = strictMatchForLead(perBuilderMap, lead.builderName, lead.postCode);
      if (strict > 0) {
        matchedStrict.set(m.campaignId, (matchedStrict.get(m.campaignId) || 0) + 1);
        totalStrict += 1;
      }
    }

    const campaigns = websiteCampaigns.map((c) => {
      const leads = leadCounts.get(c.campaignId) || 0;
      const matched = matchedSums.get(c.campaignId) || 0;
      const any = matchedAny.get(c.campaignId) || 0;
      const strict = matchedStrict.get(c.campaignId) || 0;
      const spend = Number(c.spend) || 0;
      const clicks = Number(c.clicks) || 0;
      const currentRpl = lookupRpl(rplMap, c.jobNumber);
      const futureRpl = currentRpl != null ? currentRpl * FUTURE_RPL_MULTIPLIER : null;
      return {
        campaignId: c.campaignId, campaignName: c.campaignName, jobNumber: c.jobNumber, channel: "meta",
        spend, clicks,
        impressions: Number(c.impressions) || 0,
        leads,
        costPerLead: safeDivide(spend, leads),
        conversionRate: safeDivide(leads, clicks),
        matched, matchedAny: any, matchRate: safeDivide(any, leads),
        matchedStrict: strict, matchRateStrict: safeDivide(strict, leads),
        costPerLeadReferred: safeDivide(spend, strict),
        currentRpl, futureRpl,
        revenueAtCurrentRpl: currentRpl != null ? strict * currentRpl : null,
        revenueAtFutureRpl: futureRpl != null ? strict * futureRpl : null,
      };
    });

    const totalSpend = sum(campaigns.map((c) => c.spend));
    const totalClicks = sum(campaigns.map((c) => c.clicks));
    const totalLeads = sum(campaigns.map((c) => c.leads));
    const totalRevCurrent = sum(campaigns.map((c) => c.revenueAtCurrentRpl || 0));
    const totalRevFuture = sum(campaigns.map((c) => c.revenueAtFutureRpl || 0));

    res.status(200).json({
      range: { since, until },
      sources: { meta: metaResult.source, leads: leadsResult.source, builderPostcodes: postcodesResult.source, rpl: rplResult.source },
      totals: {
        spend: totalSpend, clicks: totalClicks, leads: totalLeads,
        costPerLead: safeDivide(totalSpend, totalLeads),
        conversionRate: safeDivide(totalLeads, totalClicks),
        campaignCount: campaigns.length,
        unmatchedLeads: unmatched,
        leadsConsidered: metaLeads.length,
        leadsConsideredAllChannels: leadsResult.leads.length,
        matched: totalMatched, matchedAny: totalAnyMatched, matchRate: safeDivide(totalAnyMatched, totalLeads),
        matchedStrict: totalStrict, matchRateStrict: safeDivide(totalStrict, totalLeads),
        costPerLeadReferred: safeDivide(totalSpend, totalStrict),
        revenueAtCurrentRpl: totalRevCurrent, revenueAtFutureRpl: totalRevFuture,
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
