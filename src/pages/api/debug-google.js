import { fetchGoogleCampaignsFromSupabase } from "@/lib/googleSupabase";
import { fetchLeads } from "@/lib/leadsSheet";
import { matchLeadToCampaign } from "@/lib/campaignMatch";
import { daysAgoIso, todayIso } from "@/lib/format";

export default async function handler(req, res) {
  try {
    const since = isValidDate(req.query.since) ? req.query.since : daysAgoIso(29);
    const until = isValidDate(req.query.until) ? req.query.until : todayIso();

    const [googleResult, leadsResult] = await Promise.all([
      fetchGoogleCampaignsFromSupabase({ since, until }).catch((e) => ({ source: "error", campaigns: [], error: e.message })),
      fetchLeads({ since, until }),
    ]);

    const googleCampaigns = (googleResult.campaigns || []).map((c) => ({ ...c, channel: "google" }));
    const googleLeads = leadsResult.leads.filter((l) => l.channel === "google");
    const metaLeads = leadsResult.leads.filter((l) => l.channel === "meta");

    const matched = [];
    const unmatched = [];
    for (const lead of googleLeads) {
      const m = matchLeadToCampaign(lead.utmCampaign, googleCampaigns);
      if (m) {
        if (matched.length < 10) matched.push({ utm: lead.utmCampaign, matchedTo: m.campaignName, postcode: lead.postCode });
      } else {
        if (unmatched.length < 10) unmatched.push({ utm: lead.utmCampaign, postcode: lead.postCode, builderName: lead.builderName });
      }
    }

    res.status(200).json({
      range: { since, until },
      google: {
        supabaseSource: googleResult.source,
        supabaseError: googleResult.error || null,
        campaignCount: googleCampaigns.length,
        campaignSample: googleCampaigns.slice(0, 10).map((c) => ({ name: c.campaignName, spend: c.spend, clicks: c.clicks })),
        totalSpend: googleCampaigns.reduce((s, c) => s + (c.spend || 0), 0),
      },
      leads: {
        sheetSource: leadsResult.source,
        totalReturned: leadsResult.leads.length,
        metaCount: metaLeads.length,
        googleCount: googleLeads.length,
      },
      googleMatching: {
        matched: matched.length,
        unmatched: unmatched.length,
        matchedSamples: matched,
        unmatchedSamples: unmatched,
      },
    });
  } catch (err) {
    console.error("[api/debug-google]", err);
    res.status(500).json({ error: err.message });
  }
}

function isValidDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
