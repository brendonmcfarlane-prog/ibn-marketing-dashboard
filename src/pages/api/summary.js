/**
 * GET /api/summary?since=YYYY-MM-DD&until=YYYY-MM-DD
 *   &jobNumber=IBN-2145&campaignId=m-101&platform=meta
 *
 * Single endpoint the dashboard UI calls. Fans out to Meta, Pipedrive, and
 * the WIP sheet in parallel; aggregates the seven KPIs; returns the account
 * total plus per-builder rows plus the filtered campaign list (for the
 * campaign filter dropdown).
 *
 * Dates default to the trailing 30 days (inclusive of today).
 */

import { fetchMetaCampaigns } from "@/lib/meta";
import { fetchPipedriveDeals } from "@/lib/pipedrive";
import { fetchReferrals } from "@/lib/referrals";
import { fetchWipContracts } from "@/lib/sheets";
import { aggregate } from "@/lib/aggregate";
import { daysAgoIso, todayIso } from "@/lib/format";

export default async function handler(req, res) {
  try {
    const since = isValidDate(req.query.since) ? req.query.since : daysAgoIso(29);
    const until = isValidDate(req.query.until) ? req.query.until : todayIso();

    const filters = {
      jobNumber: req.query.jobNumber || null,
      campaignId: req.query.campaignId || null,
      platform: req.query.platform || null,
    };

    // Pipedrive + referrals fetches are intentionally NOT narrowed to the
    // user's selected range — pacing calcs (refs since contract start, last
    // 14 days) need the full 365-day window. The aggregator filters
    // per-metric. Meta stays narrowed because spend is only ever reported
    // in-window.
    const [meta, pipedrive, referrals, wip] = await Promise.all([
      fetchMetaCampaigns({ since, until }),
      fetchPipedriveDeals(),
      fetchReferrals(),
      fetchWipContracts(),
    ]);

    // Deals passed to the aggregator = referrals only.
    //
    // Leads used to come from Pipedrive deals; since 2026-04-23 Leads are
    // summed off the Meta spend tab (col AJ) instead, so Pipedrive deals
    // no longer feed the aggregator. The Pipedrive fetch is kept above so
    // the health check and source badge still reflect config state — if
    // we switch Leads back to Pipedrive later, just merge its deals in
    // here again.
    const combinedDeals = referrals.referrals;
    void pipedrive; // intentionally unused — see comment above

    const agg = aggregate({
      campaigns: meta.campaigns,
      deals: combinedDeals,
      contracts: wip.contracts,
      filters,
      range: { since, until },
      now: new Date(),
    });

    res.status(200).json({
      range: { since, until },
      filters,
      sources: {
        meta: meta.source,
        pipedrive: pipedrive.source,
        referrals: referrals.source,
        wip: wip.source,
      },
      total: agg.total,
      rows: agg.rows,
      campaigns: agg.campaigns.map((c) => ({
        campaignId: c.campaignId,
        campaignName: c.campaignName,
        jobNumber: c.jobNumber,
        platform: c.platform,
        spend: c.spend,
      })),
      contracts: wip.contracts.map((c) => ({
        jobNumber: c.jobNumber,
        builderName: c.builderName,
      })),
    });
  } catch (err) {
    console.error("[api/summary]", err);
    res.status(500).json({ error: err.message || "Unknown error" });
  }
}

function isValidDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
