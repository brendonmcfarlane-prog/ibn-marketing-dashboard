import { fetchMetaCampaigns } from "@/lib/meta";
import { fetchLeads } from "@/lib/leadsSheet";
import { matchLeadToCampaign } from "@/lib/campaignMatch";
import { fetchBuilderPostcodeMap, countMatchesForPostcode } from "@/lib/builderPostcodes";
import { AD_TYPE_WEBSITE } from "@/lib/adType";
import { daysAgoIso, todayIso } from "@/lib/format";

export default async function handler(req, res) {
  try {
    const since = isValidDate(req.query.since) ? req.query.since : daysAgoIso(29);
    const until = isValidDate(req.query.until) ? req.query.until : todayIso();

    const [meta, leads, postcodes] = await Promise.all([
      fetchMetaCampaigns({ since, until }),
      fetchLeads({ since, until }),
      fetchBuilderPostcodeMap().catch((e) => ({ source: "error", postcodeMap: new Map(), error: e.message })),
    ]);
    const websiteCampaigns = meta.campaigns.filter((c) => c.adType === AD_TYPE_WEBSITE);
    const map = postcodes.postcodeMap || new Map();

    // Sample of 20 builder postcodes
    const builderSample = Array.from(map.entries()).slice(0, 20).map(([pc, count]) => ({ postcode: pc, builderRows: count }));

    // Walk through filter-passing + campaign-matched leads and check each postcode
    let leadsConsidered = 0;
    let leadsWithPostcode = 0;
    let leadsMatched = 0;
    let leadsAnyMatch = 0;
    const leadPostcodeCounts = new Map();
    const matchedLeadSamples = [];
    const unmatchedLeadSamples = [];

    for (const lead of leads.leads) {
      const m = matchLeadToCampaign(lead.utmCampaign, websiteCampaigns);
      if (!m) continue;
      leadsConsidered += 1;
      const raw = String(lead.postCode || "").trim();
      if (raw) leadsWithPostcode += 1;
      const norm = raw.padStart(4, "0");
      leadPostcodeCounts.set(norm || "(blank)", (leadPostcodeCounts.get(norm || "(blank)") || 0) + 1);

      const matches = countMatchesForPostcode(map, lead.postCode, 3);
      if (matches > 0) {
        leadsAnyMatch += 1;
        leadsMatched += matches;
        if (matchedLeadSamples.length < 5) {
          matchedLeadSamples.push({ postCode: raw, normalised: norm, matches, builderName: lead.builderName, campaign: m.campaignName });
        }
      } else if (raw && unmatchedLeadSamples.length < 10) {
        unmatchedLeadSamples.push({ postCode: raw, normalised: norm, inMap: map.has(norm), builderName: lead.builderName, campaign: m.campaignName });
      }
    }

    // Top 20 lead postcodes by frequency
    const topLeadPostcodes = Array.from(leadPostcodeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([pc, n]) => ({ postcode: pc, leads: n, inBuilderMap: map.has(pc), builderRows: map.get(pc) || 0 }));

    res.status(200).json({
      ok: true,
      range: { since, until },
      builderMap: {
        source: postcodes.source,
        error: postcodes.error || null,
        sheetIdConfigured: !!process.env.BUILDER_DETAILS_SHEET_ID,
        rangeConfigured: process.env.BUILDER_DETAILS_SHEET_RANGE || "(default A1:AZ50000)",
        distinctPostcodes: map.size,
        sample: builderSample,
      },
      leads: {
        leadsConsidered,
        leadsWithPostcode,
        leadsAnyMatch,
        leadsMatched,
        topLeadPostcodes,
        matchedLeadSamples,
        unmatchedLeadSamples,
      },
    });
  } catch (err) {
    console.error("[api/debug-postcode-match]", err);
    res.status(500).json({ error: err.message });
  }
}

function isValidDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
