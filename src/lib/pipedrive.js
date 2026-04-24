/**
 * Pipedrive API client — server-side only.
 *
 * Fetches deals, then classifies each as either a "lead" or "referral"
 * based on whether the deal's current stage is in the lead-stage or
 * referral-stage ID lists configured in env.
 *
 * Two custom-field lookups (job number, campaign) pull marketing-specific
 * identifiers off each deal so we can attribute leads/referrals back to
 * the originating builder contract and campaign.
 *
 * addTime (Pipedrive's add_time, as yyyy-mm-dd) is preserved on every deal
 * so the aggregator can compute windowed pacing metrics (14-day, all-time
 * since contract start).
 *
 * Fetches a wide 365-day window by default — the aggregator applies
 * per-metric date filtering internally.
 *
 * Falls back to mock data when env is not configured.
 */

import { MOCK_PIPEDRIVE_DEALS } from "./mockData";

const DEFAULT_LOOKBACK_DAYS = 365;

function shouldUseMock() {
  if (process.env.USE_MOCK_DATA === "true") return true;
  return (
    !process.env.PIPEDRIVE_API_TOKEN ||
    !process.env.PIPEDRIVE_DOMAIN ||
    !process.env.PIPEDRIVE_LEAD_STAGE_IDS ||
    !process.env.PIPEDRIVE_REFERRAL_STAGE_IDS
  );
}

function idList(envVar) {
  return String(envVar || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

/**
 * Fetch deals from Pipedrive.
 *
 * Returns { source, deals: [{ dealId, jobNumber, campaignId, classification, addTime }] }
 * addTime is a yyyy-mm-dd string.
 */
export async function fetchPipedriveDeals({ since, until } = {}) {
  if (shouldUseMock()) {
    return { source: "mock", deals: MOCK_PIPEDRIVE_DEALS };
  }

  const token = process.env.PIPEDRIVE_API_TOKEN;
  const domain = process.env.PIPEDRIVE_DOMAIN;
  const leadStages = new Set(idList(process.env.PIPEDRIVE_LEAD_STAGE_IDS));
  const referralStages = new Set(idList(process.env.PIPEDRIVE_REFERRAL_STAGE_IDS));
  const jobField = process.env.PIPEDRIVE_JOB_NUMBER_FIELD || null;
  const campaignField = process.env.PIPEDRIVE_CAMPAIGN_FIELD || null;

  // Default to 365 days of history so the pacing calcs have enough data.
  const fallbackSince = new Date(
    Date.now() - DEFAULT_LOOKBACK_DAYS * 86400000
  )
    .toISOString()
    .slice(0, 10);
  const fallbackUntil = new Date().toISOString().slice(0, 10);
  const fromDate = since || fallbackSince;
  const toDate = until || fallbackUntil;

  const deals = [];
  let start = 0;
  const limit = 500;
  let more = true;

  while (more) {
    const params = new URLSearchParams({
      api_token: token,
      start: String(start),
      limit: String(limit),
    });

    const url = `https://${domain}.pipedrive.com/api/v1/deals?${params.toString()}`;
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      throw new Error(`Pipedrive deals failed: ${res.status}`);
    }
    const json = await res.json();
    const page = Array.isArray(json.data) ? json.data : [];

    for (const deal of page) {
      const added = (deal.add_time || "").slice(0, 10);
      if (added && (added < fromDate || added > toDate)) continue;

      const stageId = Number(deal.stage_id);
      let classification = null;
      if (referralStages.has(stageId)) classification = "referral";
      else if (leadStages.has(stageId)) classification = "lead";
      if (!classification) continue;

      const jobNumber = jobField && deal[jobField] ? String(deal[jobField]) : null;
      const campaignId =
        campaignField && deal[campaignField] ? String(deal[campaignField]) : null;

      deals.push({
        dealId: String(deal.id),
        jobNumber,
        campaignId,
        classification,
        addTime: added || null,
      });
    }

    more = Boolean(json.additional_data?.pagination?.more_items_in_collection);
    start += limit;
    if (page.length === 0) more = false;
  }

  return { source: "live", deals };
}
