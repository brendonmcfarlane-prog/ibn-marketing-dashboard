import { getSupabase, hasSupabaseConfig } from "./supabase";

/**
 * Reads Google Ads campaigns from Supabase ad_spend table (channel=google).
 * Mirrors fetchMetaCampaignsFromSupabase shape so it plugs into the same
 * downstream aggregation logic in /api/website-performance.
 */
export async function fetchGoogleCampaignsFromSupabase({ since, until } = {}) {
  if (!hasSupabaseConfig()) {
    return { source: "mock", campaigns: [] };
  }

  const supabase = getSupabase();
  let query = supabase
    .from("ad_spend")
    .select("campaign_id,campaign_name,spend,clicks,impressions,date,job_number")
    .eq("channel", "google");
  if (since) query = query.gte("date", since);
  if (until) query = query.lte("date", until);

  const { data, error } = await query;
  if (error) throw new Error(`Supabase Google read failed: ${error.message}`);

  const byCampaign = new Map();
  for (const row of data || []) {
    const id = row.campaign_id;
    if (!id) continue;
    if (!byCampaign.has(id)) {
      byCampaign.set(id, {
        campaignId: id,
        campaignName: row.campaign_name || id,
        jobNumber: row.job_number || null,
        platform: "google",
        channel: "google",
        spend: 0,
        impressions: 0,
        clicks: 0,
      });
    }
    const entry = byCampaign.get(id);
    entry.spend += Number(row.spend) || 0;
    entry.impressions += Number(row.impressions) || 0;
    entry.clicks += Number(row.clicks) || 0;
  }

  return { source: "live-supabase", campaigns: Array.from(byCampaign.values()) };
}
