import { fetchLeads } from "@/lib/leadsSheet";
import { fetchMetaCampaignsFromSupabase } from "@/lib/metaSupabase";
import { fetchGoogleCampaignsFromSupabase } from "@/lib/googleSupabase";
import { AD_TYPE_WEBSITE } from "@/lib/adType";
import { daysAgoIso, todayIso } from "@/lib/format";

export default async function handler(req, res) {
  try {
    const since = isValidDate(req.query.since) ? req.query.since : daysAgoIso(29);
    const until = isValidDate(req.query.until) ? req.query.until : todayIso();
    const q = String(req.query.q || "").toLowerCase().trim();

    const [leadsResult, metaResult, googleResult] = await Promise.all([
      fetchLeads({ since, until }),
      fetchMetaCampaignsFromSupabase({ since, until }),
      fetchGoogleCampaignsFromSupabase({ since, until }).catch(() => ({ campaigns: [] })),
    ]);

    const totalLeadsCount = leadsResult.leads.length;
    const leadsWithPostcode = leadsResult.leads.filter((l) => l.postCode && l.postCode.trim());

    const leadsPerBuilder = new Map();
    const samplesByBuilder = new Map();
    for (const lead of leadsWithPostcode) {
      if (!lead.builderName) continue;
      const key = lead.builderName.toLowerCase().trim();
      if (!key) continue;
      leadsPerBuilder.set(key, (leadsPerBuilder.get(key) || 0) + 1);
      if (!samplesByBuilder.has(key)) samplesByBuilder.set(key, []);
      const samples = samplesByBuilder.get(key);
      if (samples.length < 3) samples.push({
        date: lead.createdDate,
        builder: lead.builderName,
        postcode: lead.postCode,
        traffic: lead.trafficChannel,
        source: lead.source,
        medium: lead.medium,
      });
    }

    const metaCampaigns = metaResult.campaigns
      .filter((c) => c.adType === AD_TYPE_WEBSITE)
      .map((c) => ({ campaignName: c.campaignName, channel: "meta" }));
    const googleCampaigns = (googleResult.campaigns || []).map((c) => ({ campaignName: c.campaignName, channel: "google" }));
    const allCampaigns = [...metaCampaigns, ...googleCampaigns];

    const knownBuilders = Array.from(leadsPerBuilder.keys()).sort((a, b) => b.length - a.length);

    function findBuilder(campaignName) {
      const lower = String(campaignName || "").toLowerCase();
      for (const b of knownBuilders) {
        if (lower.includes(b)) return { builderKey: b, totalLeads: leadsPerBuilder.get(b) || 0 };
      }
      return { builderKey: null, totalLeads: 0 };
    }

    const campaignToBuilder = allCampaigns.map((c) => ({
      campaign: c.campaignName,
      channel: c.channel,
      ...findBuilder(c.campaignName),
    }));

    const builderBreakdown = Array.from(leadsPerBuilder.entries())
      .map(([builder, count]) => ({
        builderKey: builder,
        leadCountWithPostcode: count,
        sampleLeads: samplesByBuilder.get(builder) || [],
      }))
      .sort((a, b) => b.leadCountWithPostcode - a.leadCountWithPostcode);

    const filteredBuilders = q
      ? builderBreakdown.filter((b) => b.builderKey.includes(q))
      : builderBreakdown;
    const filteredCampaigns = q
      ? campaignToBuilder.filter((c) => c.campaign.toLowerCase().includes(q) || (c.builderKey || "").includes(q))
      : campaignToBuilder;

    res.status(200).json({
      range: { since, until },
      totals: {
        leadRowsInDateRange: totalLeadsCount,
        leadsWithPostcode: leadsWithPostcode.length,
        leadsWithoutPostcode: totalLeadsCount - leadsWithPostcode.length,
        distinctBuildersWithPostcodedLeads: leadsPerBuilder.size,
      },
      builderBreakdown: filteredBuilders.slice(0, 50),
      campaignToBuilder: filteredCampaigns.slice(0, 30),
    });
  } catch (err) {
    console.error("[api/debug-total-leads]", err);
    res.status(500).json({ error: err.message });
  }
}

function isValidDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
