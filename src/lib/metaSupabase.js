import { getSupabase, hasSupabaseConfig } from "./supabase";
import { classifyAdType } from "./adType";
import { extractJobNumberFromName } from "./meta";

/**
 * Reads Meta campaigns from Supabase ad_spend table.
 * Returns the same shape as fetchMetaCampaigns() from the sheet reader,
 * so it's a drop-in replacement once we cut over.
 */
export async function fetchMetaCampaignsFromSupabase({ since, until } = {}) {
  if (!hasSupabaseConfig()) {
    return { source: "mock", campaigns: [] };
  }

  const supabase = getSupabase();
  let query = supabase
    .from("ad_spend")
    .select("campaign_id,campaign_name,spend,clicks,impressions,leads,date,job_number")
    .eq("channel", "meta");
  if (since) query = query.gte("date", since);
  if (until) query = query.lte("date", until);

  const { data, error } = await query;
  if (error) throw new Error(`Supabase Meta read failed: ${error.message}`);

  // Aggregate per (campaign_id, date)-pre-aggregated rows up to campaign level
  // across the date range. Mirrors meta.js sheet aggregation.
  const byCampaign = new Map();
  for (const row of data || []) {
    const id = row.campaign_id;
    if (!id) continue;
    if (!byCampaign.has(id)) {
      const name = row.campaign_name || id;
      byCampaign.set(id, {
        campaignId: id,
        campaignName: name,
        jobNumber: row.job_number || extractJobNumberFromName(name),
        platform: "meta",
        adType: classifyAdType(name),
        spend: 0,
        impressions: 0,
        clicks: 0,
        leads: 0,
      });
    }
    const entry = byCampaign.get(id);
    entry.spend += Number(row.spend) || 0;
    entry.impressions += Number(row.impressions) || 0;
    entry.clicks += Number(row.clicks) || 0;
    entry.leads += Number(row.leads) || 0;
  }

  return { source: "live-supabase", campaigns: Array.from(byCampaign.values()) };
}
