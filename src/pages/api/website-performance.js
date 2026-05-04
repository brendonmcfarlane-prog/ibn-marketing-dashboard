/**
 * GET /api/website-performance?since=YYYY-MM-DD&until=YYYY-MM-DD
 *
 * Per-campaign performance for Meta campaigns classified as Website.
 * Combines two data sources:
 *   - Spend / Clicks / Impressions  ← Meta spend sheet
 *   - Leads (actual form fills)     ← Leads Master sheet, matched on
 *                                     utm_campaign via suffix match
 *
 * Per-campaign metrics:
 *   - Spend
 *   - Clicks
 *   - Leads (from Leads Master, NOT Meta column AJ — see project notes)
 *   - Cost per Lead = Spend / Leads
 *   - Conversion Rate = Leads / Clicks
 *
 * Lead Ads campaigns are intentionally excluded from this view because
 * they capture leads in-platform (and don't carry UTMs), so the leads
 * sheet won't have rows for them.
 *
 * Dates default to the trailing 30 days (inclusive of today).
 */

import { fetchMetaCampaigns } from "@/lib/meta";
import { fetchLeads } from "@/lib/leadsSheet";
import { countLeadsByCampaign } from "@/lib/campaignMatch";
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

    // Restrict to Website-classified Meta campaigns. Lead Ads don't carry
    // UTMs, so any leads row "matching" one would be coincidence at best.
    const websiteCampaigns = metaResult.campaigns.filter(
      (c) => c.adType === AD_TYPE_WEBSITE
    );

    const leadCounts = countLeadsByCampaign(leadsResult.leads, websiteCampaigns);

    // Track unmatched leads so we can surface a count to the UI — high
    // unmatched share usually points at a UTM convention drift on a new
    // campaign, which Brendon should fix at the ad-set level.
    let unmatchedLeadCount = 0;
    for (const lead of leadsResult.leads) {
      // The matcher is run again here only to count misses; cheap enough
      // for the volumes we expect (a few thousand leads / month max).
      const anyMatch = websiteCampaigns.some((c) =>
        suffixMatches(lead.utmCampaign, c.campaignName)
      );
      if (!anyMatch) unmatchedLeadCount += 1;
    }

    const campaigns = websiteCampaigns.map((c) => {
      const leads = leadCounts.get(c.campaignId) || 0;
      const spend = Number(c.spend) || 0;
      const clicks = Number(c.clicks) || 0;
      return {
        campaignId: c.campaignId,
        campaignName: c.campaignName,
        jobNumber: c.jobNumber,
        spend,
        clicks,
        impressions: Number(c.impressions) || 0,
        leads,
        costPerLead: safeDivide(spend, leads),
        conversionRate: safeDivide(leads, clicks),
      };
    });

    const totalSpend = sum(campaigns.map((c) => c.spend));
    const totalClicks = sum(campaigns.map((c) => c.clicks));
    const totalLeads = sum(campaigns.map((c) => c.leads));

    res.status(200).json({
      range: { since, until },
      sources: {
        meta: metaResult.source,
        leads: leadsResult.source,
      },
      totals: {
        spend: totalSpend,
        clicks: totalClicks,
        leads: totalLeads,
        costPerLead: safeDivide(totalSpend, totalLeads),
        conversionRate: safeDivide(totalLeads, totalClicks),
        campaignCount: campaigns.length,
        unmatchedLeads: unmatchedLeadCount,
        leadsConsidered: leadsResult.leads.length,
      },
      campaigns: campaigns.sort((a, b) => b.spend - a.spend),
    });
  } catch (err) {
    console.error("[api/website-performance]", err);
    res.status(500).json({ error: err.message || "Unknown error" });
  }
}

// Inline helper — same suffix logic as campaignMatch.js but used here
// just for counting unmatched leads. Kept inline rather than re-exported
// from campaignMatch.js to avoid two functions wandering out of sync.
function suffixMatches(utmValue, campaignName) {
  const a = String(utmValue || "").toLowerCase().replace(/\s+/g, " ").trim();
  const b = String(campaignName || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!a || !b) return false;
  return a === b || a.endsWith(b);
}

function sum(arr) {
  return arr.reduce((acc, n) => acc + (Number(n) || 0), 0);
}

function isValidDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
