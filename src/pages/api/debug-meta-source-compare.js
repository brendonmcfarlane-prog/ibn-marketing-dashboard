import { fetchMetaCampaigns } from "@/lib/meta";
import { fetchMetaCampaignsFromSupabase } from "@/lib/metaSupabase";
import { daysAgoIso, todayIso } from "@/lib/format";

export default async function handler(req, res) {
  try {
    const since = isValidDate(req.query.since) ? req.query.since : daysAgoIso(6);
    const until = isValidDate(req.query.until) ? req.query.until : todayIso();

    const [sheetResult, supabaseResult] = await Promise.all([
      fetchMetaCampaigns({ since, until }).catch((e) => ({ source: "error", campaigns: [], error: e.message })),
      fetchMetaCampaignsFromSupabase({ since, until }).catch((e) => ({ source: "error", campaigns: [], error: e.message })),
    ]);

    const sheetTotals = aggregate(sheetResult.campaigns);
    const supabaseTotals = aggregate(supabaseResult.campaigns);

    const sheetIds = new Set(sheetResult.campaigns.map((c) => c.campaignId));
    const supabaseIds = new Set(supabaseResult.campaigns.map((c) => c.campaignId));
    const onlyInSheet = sheetResult.campaigns.filter((c) => !supabaseIds.has(c.campaignId)).map((c) => ({ campaignId: c.campaignId, campaignName: c.campaignName, spend: c.spend, leads: c.leads }));
    const onlyInSupabase = supabaseResult.campaigns.filter((c) => !sheetIds.has(c.campaignId)).map((c) => ({ campaignId: c.campaignId, campaignName: c.campaignName, spend: c.spend, leads: c.leads }));

    const sharedComparison = [];
    for (const sheetCamp of sheetResult.campaigns) {
      const supCamp = supabaseResult.campaigns.find((c) => c.campaignId === sheetCamp.campaignId);
      if (!supCamp) continue;
      sharedComparison.push({
        campaignId: sheetCamp.campaignId,
        campaignName: sheetCamp.campaignName,
        spend: { sheet: sheetCamp.spend, supabase: supCamp.spend, delta: round2(supCamp.spend - sheetCamp.spend) },
        clicks: { sheet: sheetCamp.clicks, supabase: supCamp.clicks, delta: supCamp.clicks - sheetCamp.clicks },
        leads: { sheet: sheetCamp.leads, supabase: supCamp.leads, delta: supCamp.leads - sheetCamp.leads },
      });
    }

    res.status(200).json({
      range: { since, until },
      sheet: { source: sheetResult.source, campaignCount: sheetResult.campaigns.length, totals: sheetTotals, error: sheetResult.error || null },
      supabase: { source: supabaseResult.source, campaignCount: supabaseResult.campaigns.length, totals: supabaseTotals, error: supabaseResult.error || null },
      diffSummary: {
        totalSpendDelta: round2(supabaseTotals.spend - sheetTotals.spend),
        totalClicksDelta: supabaseTotals.clicks - sheetTotals.clicks,
        totalLeadsDelta: supabaseTotals.leads - sheetTotals.leads,
        campaignCountDelta: supabaseResult.campaigns.length - sheetResult.campaigns.length,
      },
      onlyInSheet,
      onlyInSupabase,
      topDeltas: sharedComparison.sort((a, b) => Math.abs(b.spend.delta) - Math.abs(a.spend.delta)).slice(0, 15),
    });
  } catch (err) {
    console.error("[api/debug-meta-source-compare]", err);
    res.status(500).json({ error: err.message });
  }
}

function aggregate(campaigns) {
  return campaigns.reduce((acc, c) => ({
    spend: round2(acc.spend + (Number(c.spend) || 0)),
    clicks: acc.clicks + (Number(c.clicks) || 0),
    leads: acc.leads + (Number(c.leads) || 0),
    impressions: acc.impressions + (Number(c.impressions) || 0),
  }), { spend: 0, clicks: 0, leads: 0, impressions: 0 });
}

function round2(n) { return Math.round(n * 100) / 100; }
function isValidDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
