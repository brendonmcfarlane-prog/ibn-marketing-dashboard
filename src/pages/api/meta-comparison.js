/**
 * GET /api/meta-comparison?since=YYYY-MM-DD&until=YYYY-MM-DD
 *
 * Top-of-funnel comparison between Meta Lead Ads and Meta Website
 * campaigns. Three KPIs per group:
 *   - Spend
 *   - Leads (sum of Meta sheet col AJ within the group)
 *   - Cost Per Lead (Spend / Leads)
 *
 * Bottom-of-funnel metrics (Referrals, Revenue, ROMS) are intentionally
 * NOT included on this view because referrals attribute to a job, not
 * a campaign — see project memory for the reasoning.
 *
 * Dates default to the trailing 30 days (inclusive of today).
 */

import { fetchMetaCampaigns } from "@/lib/meta";
import { classifyAdType, AD_TYPE_LEAD_ADS, AD_TYPE_WEBSITE } from "@/lib/adType";
import { daysAgoIso, todayIso, safeDivide } from "@/lib/format";

export default async function handler(req, res) {
  try {
    const since = isValidDate(req.query.since) ? req.query.since : daysAgoIso(29);
    const until = isValidDate(req.query.until) ? req.query.until : todayIso();

    const meta = await fetchMetaCampaigns({ since, until });

    // Defensive — meta.js tags adType, but if a campaign somehow slipped
    // through without one (mock-data drift, bad data shape) classify here.
    const campaigns = meta.campaigns.map((c) => ({
      ...c,
      adType: c.adType || classifyAdType(c.campaignName),
    }));

    const leadAds = aggregateGroup(
      campaigns.filter((c) => c.adType === AD_TYPE_LEAD_ADS)
    );
    const website = aggregateGroup(
      campaigns.filter((c) => c.adType === AD_TYPE_WEBSITE)
    );
    const all = aggregateGroup(campaigns);

    res.status(200).json({
      range: { since, until },
      sources: { meta: meta.source },
      totals: { leadAds, website, all },
      campaigns: campaigns
        .map((c) => ({
          campaignId: c.campaignId,
          campaignName: c.campaignName,
          jobNumber: c.jobNumber,
          adType: c.adType,
          spend: Number(c.spend) || 0,
          leads: Number(c.leads) || 0,
          costPerLead: safeDivide(Number(c.spend) || 0, Number(c.leads) || 0),
        }))
        .sort((a, b) => b.spend - a.spend),
    });
  } catch (err) {
    console.error("[api/meta-comparison]", err);
    res.status(500).json({ error: err.message || "Unknown error" });
  }
}

function aggregateGroup(campaigns) {
  const spend = sum(campaigns.map((c) => c.spend));
  const leads = sum(campaigns.map((c) => c.leads));
  return {
    spend,
    leads,
    costPerLead: safeDivide(spend, leads),
    campaignCount: campaigns.length,
  };
}

function sum(arr) {
  return arr.reduce((acc, n) => acc + (Number(n) || 0), 0);
}

function isValidDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
