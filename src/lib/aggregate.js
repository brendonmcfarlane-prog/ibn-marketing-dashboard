/**
 * Metric aggregation — the single place the seven KPIs and two pacing
 * differences are calculated.
 *
 * Headline KPIs (scoped to the user's selected date range):
 *   1. Media Spend          = sum of campaign.spend across selected campaigns
 *   2. Leads                = sum of campaign.leads across selected campaigns
 *                             (on-platform lead form fills — from Meta sheet
 *                             col AJ). Used to be count of Pipedrive deals;
 *                             switched 2026-04-23 at Brendon's request.
 *   3. Cost Per Lead (CPL)  = Media Spend / Leads
 *   4. Referrals            = count of deals classified 'referral' in the
 *                             selected range
 *   5. Cost Per Referral    = Media Spend / Referrals
 *   6. Revenue              = Sum of per-referral RPL (read off the
 *                             referrals sheet). Each referral row carries
 *                             its own RPL — we no longer multiply Referrals
 *                             × WIP RPL. If a referral has no RPL we fall
 *                             back to the contract's WIP RPL for safety.
 *   7. Return on Media Spend (ROMS) = Revenue / Media Spend
 *
 * Contract-level pacing (NOT filtered by the user's date range — always
 * measured relative to the contract window):
 *   - Pacing                = Referrals-since-contract-start ÷ Total Lead Target
 *   - All Time Diff (days)  = Days needed to hit target at all-time rate
 *                             MINUS days remaining in contract.
 *                             Positive = behind, negative = ahead.
 *   - 14 Day Diff  (days)   = Same but using the last-14-days rate.
 *
 * Rolled up at two levels:
 *   - total:       account-wide across all filtered campaigns/contracts
 *                  (scoped to selected date range)
 *   - rows:        per builder contract (the level Brendon actually manages)
 *
 * Filtering behaviour:
 *   - No filters active → show all WIP contracts plus any jobs seen in data.
 *   - Any filter active → show only the jobs that match the filtered data,
 *     so a filtered view doesn't surface empty rows for unrelated contracts.
 */

import { safeDivide } from "./format";

const MS_PER_DAY = 86400000;

/**
 * @param {object} params
 * @param {Array}  params.campaigns  Normalised Meta (and eventually Google) campaign rows
 * @param {Array}  params.deals       Classified Pipedrive deals ({jobNumber, campaignId, classification, addTime})
 * @param {Array}  params.contracts   WIP contracts ({jobNumber, builderName, revenuePerReferredLead, totalLeadTarget, contractStartDate, contractEndDate})
 * @param {object} params.filters    { jobNumber?: string|null, campaignId?: string|null, platform?: 'meta'|'google'|null }
 * @param {object} params.range       { since, until } — user's selected date window (yyyy-mm-dd strings)
 * @param {Date}   params.now         Reference "today" for pacing calcs (defaults to new Date())
 */
export function aggregate({
  campaigns,
  deals,
  contracts,
  filters = {},
  range = {},
  now = new Date(),
}) {
  const {
    jobNumber: filterJob,
    campaignId: filterCampaign,
    platform: filterPlatform,
  } = filters;
  const hasFilter = Boolean(filterJob || filterCampaign || filterPlatform);

  const selectedSince = range.since ? new Date(`${range.since}T00:00:00`) : null;
  const selectedUntil = range.until
    ? new Date(`${range.until}T23:59:59.999`)
    : null;
  const fourteenDaysAgo = new Date(now.getTime() - 14 * MS_PER_DAY);

  // ---------- Filter campaigns (platform/job/campaign) ----------
  const filteredCampaigns = campaigns.filter((c) => {
    if (filterPlatform && c.platform !== filterPlatform) return false;
    if (filterJob && c.jobNumber !== filterJob) return false;
    if (filterCampaign && c.campaignId !== filterCampaign) return false;
    return true;
  });

  const campaignIdsInScope = new Set(
    filteredCampaigns.map((c) => c.campaignId)
  );

  // ---------- Scoped deals (user date range + all attribute filters) ----------
  const scopedDeals = deals.filter((d) => {
    if (filterJob && d.jobNumber !== filterJob) return false;
    if (filterCampaign && d.campaignId !== filterCampaign) return false;
    if (filterPlatform && d.campaignId && !campaignIdsInScope.has(d.campaignId)) {
      return false;
    }
    if (!isWithinRange(d.addTime, selectedSince, selectedUntil)) return false;
    return true;
  });

  // ---------- Decide which jobs to surface as rows ----------
  const contractsByJob = Object.fromEntries(
    contracts.map((c) => [c.jobNumber, c])
  );

  const jobKeys = new Set();
  if (hasFilter) {
    filteredCampaigns.forEach((c) => c.jobNumber && jobKeys.add(c.jobNumber));
    scopedDeals.forEach((d) => d.jobNumber && jobKeys.add(d.jobNumber));
    // Respect an explicit job filter even if it has no activity in scope
    if (filterJob) jobKeys.add(filterJob);
  } else {
    contracts.forEach((c) => jobKeys.add(c.jobNumber));
    filteredCampaigns.forEach((c) => c.jobNumber && jobKeys.add(c.jobNumber));
    scopedDeals.forEach((d) => d.jobNumber && jobKeys.add(d.jobNumber));
  }

  // ---------- Build row per job ----------
  const rows = Array.from(jobKeys).map((jobNumber) => {
    const contract = contractsByJob[jobNumber];
    const jobCampaigns = filteredCampaigns.filter(
      (c) => c.jobNumber === jobNumber
    );
    const jobScopedDeals = scopedDeals.filter((d) => d.jobNumber === jobNumber);

    // Scoped KPIs (obey the user's selected date range)
    const spend = sum(jobCampaigns.map((c) => c.spend));
    // Leads now come from the Meta spend tab (col AJ, aggregated per
    // campaign). See aggregator docstring.
    const leads = sum(jobCampaigns.map((c) => c.leads || 0));
    const referralDeals = jobScopedDeals.filter(
      (d) => d.classification === "referral"
    );
    const referrals = referralDeals.length;
    const rpr = contract?.revenuePerReferredLead || 0;
    // Revenue = sum of per-row RPL on the referrals sheet. A referral
    // row without its own RPL falls back to the WIP contract's RPL so
    // we don't silently zero out revenue for a legitimate referral.
    const revenue = sum(
      referralDeals.map((d) =>
        Number.isFinite(d.revenue) && d.revenue > 0 ? d.revenue : rpr
      )
    );

    // Contract-level pacing (NOT scoped to user's date range)
    // Use ALL deals for this job, NOT filtered by campaign/platform —
    // pacing is contract-level, not campaign-level.
    const allJobDeals = deals.filter((d) => d.jobNumber === jobNumber);

    const contractStart = parseDate(contract?.contractStartDate);
    const contractEnd = parseDate(contract?.contractEndDate);

    const refsSinceStart = allJobDeals.filter(
      (d) =>
        d.classification === "referral" &&
        isWithinRange(d.addTime, contractStart, now)
    ).length;

    const refs14Days = allJobDeals.filter(
      (d) =>
        d.classification === "referral" &&
        isWithinRange(d.addTime, fourteenDaysAgo, now)
    ).length;

    const daysSinceStart = contractStart
      ? Math.max(1, Math.ceil((now - contractStart) / MS_PER_DAY))
      : null;
    const daysRemaining = contractEnd
      ? Math.max(0, Math.ceil((contractEnd - now) / MS_PER_DAY))
      : null;

    const target = contract?.totalLeadTarget || 0;
    const remainingToTarget = Math.max(0, target - refsSinceStart);
    const targetHit = target > 0 && refsSinceStart >= target;

    // Rates (referrals per day)
    const rateAllTime =
      daysSinceStart && daysSinceStart > 0
        ? refsSinceStart / daysSinceStart
        : 0;
    const rate14 = refs14Days / 14;

    // Days needed at each rate to finish the remaining target
    const daysNeededAllTime =
      rateAllTime > 0 ? remainingToTarget / rateAllTime : null;
    const daysNeeded14 = rate14 > 0 ? remainingToTarget / rate14 : null;

    // Difference = days needed − days remaining in contract.
    // Positive = behind (at current pace you land after contract end).
    // Negative = ahead  (you land before contract end).
    // Null = cannot compute (no target, no rate, or no contract end).
    let diffAllTime = null;
    let diff14 = null;
    if (targetHit) {
      diffAllTime = 0;
      diff14 = 0;
    } else if (target > 0 && daysRemaining !== null) {
      if (daysNeededAllTime !== null) {
        diffAllTime = Math.round(daysNeededAllTime - daysRemaining);
      }
      if (daysNeeded14 !== null) {
        diff14 = Math.round(daysNeeded14 - daysRemaining);
      }
    }

    return {
      jobNumber,
      builderName: contract?.builderName || "—",
      inWip: Boolean(contract),
      contractStartDate: contract?.contractStartDate || null,
      contractEndDate: contract?.contractEndDate || null,
      totalLeadTarget: target,
      revenuePerReferredLead: rpr,
      // Scoped KPIs
      spend,
      leads,
      referrals,
      costPerLead: safeDivide(spend, leads),
      costPerReferral: safeDivide(spend, referrals),
      revenue,
      roms: safeDivide(revenue, spend),
      // Contract-level pacing
      refsSinceStart,
      refs14Days,
      pacing: safeDivide(refsSinceStart, target),
      diffAllTime,
      diff14,
      targetHit,
      daysRemaining,
    };
  });

  // Sort by revenue desc so the biggest contracts surface at the top.
  rows.sort((a, b) => b.revenue - a.revenue);

  // ---------- Account-wide totals (scoped) ----------
  const totalSpend = sum(rows.map((r) => r.spend));
  const totalLeads = sum(rows.map((r) => r.leads));
  const totalReferrals = sum(rows.map((r) => r.referrals));
  const totalRevenue = sum(rows.map((r) => r.revenue));

  const total = {
    spend: totalSpend,
    leads: totalLeads,
    referrals: totalReferrals,
    revenue: totalRevenue,
    costPerLead: safeDivide(totalSpend, totalLeads),
    costPerReferral: safeDivide(totalSpend, totalReferrals),
    roms: safeDivide(totalRevenue, totalSpend),
    // Extra view for Brendon: the inverse formulation he originally asked for.
    spendShareOfRevenue: safeDivide(totalSpend, totalRevenue),
  };

  return { total, rows, campaigns: filteredCampaigns };
}

function sum(arr) {
  return arr.reduce((acc, n) => acc + (Number(n) || 0), 0);
}

function parseDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(`${String(v).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isWithinRange(addTime, since, until) {
  if (!since && !until) return true;
  if (!addTime) return false; // If we don't know the date, exclude from windowed metrics.
  const t = new Date(addTime);
  if (Number.isNaN(t.getTime())) return false;
  if (since && t < since) return false;
  if (until && t > until) return false;
  return true;
}
