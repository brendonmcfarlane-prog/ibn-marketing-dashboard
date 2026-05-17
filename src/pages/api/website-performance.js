import { fetchMetaCampaigns } from "@/lib/meta";
import { fetchGoogleCampaignsFromSupabase } from "@/lib/googleSupabase";
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

    const [metaResult, googleResult, leadsResult, postcodesResult, rplResult] = await Promise.all([
      fetchMetaCampaigns({ since, until }),
      fetchGoogleCampaignsFromSupabase({ since, until }).catch((e) => { console.error("[google-supabase]", e.message); return { source: "error", campaigns: [] }; }),
      fetchLeads({ since, until }),
      fetchBuilderPostcodeMap().catch((e) => { console.error("[builder-postcodes]", e.message); return { source: "error", postcodeMap: new Map(), perBuilderMap: new Map() }; }),
      fetchCurrentRevenuePerLead().catch((e) => { console.error("[performance-tracking]", e.message); return { source: "error", rplMap: new Map() }; }),
    ]);

    // Meta side: filter to Website ad type. Google side: all campaigns drive
    // website traffic so no adType filter.
    const metaCampaigns = metaResult.campaigns
      .filter((c) => c.adType === AD_TYPE_WEBSITE)
      .map((c) => ({ ...c, channel: "meta" }));
    const googleCampaigns = (googleResult.campaigns || []).map((c) => ({ ...c, channel: "google" }));
    const allCampaigns = [...metaCampaigns, ...googleCampaigns];

    const postcodeMap = postcodesResult.postcodeMap || new Map();
    const perBuilderMap = postcodesResult.perBuilderMap || new Map();
    const rplMap = rplResult.rplMap || new Map();

    // Channel-aware lead matching: Meta leads only match Meta campaigns;
    // Google leads only match Google campaigns. Prevents cross-channel
    // false-positives from generic campaign names.
    const leadCounts = new Map();
    const matchedSums = new Map();
    const matchedAny = new Map();
    const matchedStrict = new Map();
    let unmatched = 0, totalMatched = 0, totalAnyMatched = 0, totalStrict = 0;
    let leadsConsidered = 0;

    for (const lead of leadsResult.leads) {
      const pool = lead.channel === "google" ? googleCampaigns : metaCampaigns;
      leadsConsidered += 1;
      const m = matchLeadToCampaign(lead.utmCampaign, pool);
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

    const campaigns = allCampaigns.map((c) => {
      const leads = leadCounts.get(c.campaignId) || 0;
      const matched = matchedSums.get(c.campaignId) || 0;
      const any = matchedAny.get(c.campaignId) || 0;
      const strict = matchedStrict.get(c.campaignId) || 0;
      const spend = Number(c.spend) || 0;
      const clicks = Number(c.clicks) || 0;
      const currentRpl = lookupRpl(rplMap, c.jobNumber);
      const futureRpl = currentRpl != null ? currentRpl * FUTURE_RPL_MULTIPLIER : null;
      return {
        campaignId: c.campaignId, campaignName: c.campaignName, jobNumber: c.jobNumber, channel: c.channel,
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
      sources: { meta: metaResult.source, google: googleResult.source, leads: leadsResult.source, builderPostcodes: postcodesResult.source, rpl: rplResult.source },
      totals: {
        spend: totalSpend, clicks: totalClicks, leads: totalLeads,
        costPerLead: safeDivide(totalSpend, totalLeads),
        conversionRate: safeDivide(totalLeads, totalClicks),
        campaignCount: campaigns.length,
        unmatchedLeads: unmatched,
        leadsConsidered,
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
