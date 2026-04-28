/**
 * Mock data used whenever USE_MOCK_DATA=true or a credential is missing.
 *
 * Numbers are made up but plausibly shaped so the UI exercises every
 * code path (zero leads, high ROMS, low ROMS, campaigns with no referrals).
 * Deals are timestamped (addTime) so the aggregator can compute 14-day and
 * all-time pacing rates — referrals are spread evenly across the contract's
 * active window up to "today".
 */

export const MOCK_WIP_CONTRACTS = [
  {
    jobNumber: "IBN-2145",
    builderName: "Carlisle Homes",
    revenuePerReferredLead: 1800,
    totalLeadTarget: 400,
    contractStartDate: "2025-11-01",
    contractEndDate: "2026-10-31",
  },
  {
    jobNumber: "IBN-2160",
    builderName: "Henley Homes",
    revenuePerReferredLead: 2100,
    totalLeadTarget: 300,
    contractStartDate: "2025-12-15",
    contractEndDate: "2026-12-14",
  },
  {
    jobNumber: "IBN-2172",
    builderName: "Simonds Homes",
    revenuePerReferredLead: 1500,
    totalLeadTarget: 250,
    contractStartDate: "2026-01-10",
    contractEndDate: "2026-09-30",
  },
  {
    jobNumber: "IBN-2189",
    builderName: "Metricon",
    revenuePerReferredLead: 2400,
    totalLeadTarget: 350,
    contractStartDate: "2025-10-01",
    contractEndDate: "2026-09-30",
  },
  {
    jobNumber: "IBN-2203",
    builderName: "Boutique Homes",
    revenuePerReferredLead: 1950,
    totalLeadTarget: 180,
    contractStartDate: "2026-02-15",
    contractEndDate: "2027-02-14",
  },
];

// Quick lookup for deal-date distribution.
const CONTRACT_START_BY_JOB = Object.fromEntries(
  MOCK_WIP_CONTRACTS.map((c) => [c.jobNumber, c.contractStartDate])
);

// Meta spend by campaign, tagged to a builder/job via campaign name convention.
export const MOCK_META_CAMPAIGNS = [
  {
    campaignId: "m-101",
    campaignName: "IBN-2145_Carlisle_Prospecting_VIC",
    jobNumber: "IBN-2145",
    platform: "meta",
    spend: 4820.55,
    impressions: 182430,
    clicks: 3821,
    leads: 142,
  },
  {
    campaignId: "m-102",
    campaignName: "IBN-2145 Carlisle Website Retargeting VIC",
    jobNumber: "IBN-2145",
    platform: "meta",
    spend: 1240.8,
    impressions: 52211,
    clicks: 1104,
    leads: 44,
  },
  {
    campaignId: "m-103",
    campaignName: "IBN-2160 Henley Lead Ads NATIONAL",
    jobNumber: "IBN-2160",
    platform: "meta",
    spend: 3980.0,
    impressions: 160400,
    clicks: 2918,
    leads: 121,
  },
  {
    campaignId: "m-104",
    campaignName: "IBN-2172 Simonds Website Prospecting VIC",
    jobNumber: "IBN-2172",
    platform: "meta",
    spend: 2615.25,
    impressions: 98450,
    clicks: 2011,
    leads: 78,
  },
  {
    campaignId: "m-105",
    campaignName: "IBN-2189 Metricon Lead Ads VIC",
    jobNumber: "IBN-2189",
    platform: "meta",
    spend: 5620.4,
    impressions: 214800,
    clicks: 4382,
    leads: 188,
  },
  {
    campaignId: "m-106",
    campaignName: "IBN-2203 Boutique Website Prospecting VIC",
    jobNumber: "IBN-2203",
    platform: "meta",
    spend: 1820.0,
    impressions: 68300,
    clicks: 1411,
    leads: 52,
  },
];

// Pipedrive-shaped: each deal already tagged with jobNumber + campaign and
// classified as a lead or referral by stage. addTime simulates Pipedrive's
// add_time (deal created timestamp).
export const MOCK_PIPEDRIVE_DEALS = [
  ...generateDeals("IBN-2145", "m-101", 142, 38),
  ...generateDeals("IBN-2145", "m-102", 44, 12),
  ...generateDeals("IBN-2160", "m-103", 121, 29),
  ...generateDeals("IBN-2172", "m-104", 78, 14),
  ...generateDeals("IBN-2189", "m-105", 188, 55),
  ...generateDeals("IBN-2203", "m-106", 52, 8),
];

// Referrals-sheet-shaped: the "All Contacts" tab on the referrals sheet.
// Each row is one referral; revenue carries the per-row RPL.
export const MOCK_REFERRALS = MOCK_PIPEDRIVE_DEALS
  .filter((d) => d.classification === "referral")
  .map((d) => {
    const contract = MOCK_WIP_CONTRACTS.find(
      (c) => c.jobNumber === d.jobNumber
    );
    return {
      dealId: `${d.dealId}-R`,
      jobNumber: d.jobNumber,
      campaignId: d.campaignId,
      classification: "referral",
      addTime: d.addTime,
      revenue: contract?.revenuePerReferredLead || 0,
    };
  });

/**
 * Spread `leads` deals evenly from the contract's start date to today,
 * assigning `referrals` of them the 'referral' classification at evenly
 * spaced indices (so the 14-day window picks up a realistic share of them).
 */
function generateDeals(jobNumber, campaignId, leads, referrals) {
  const deals = [];
  const startIso = CONTRACT_START_BY_JOB[jobNumber];
  const start = startIso
    ? new Date(startIso).getTime()
    : Date.now() - 180 * 86400000; // 180d fallback
  const end = Date.now();
  const span = Math.max(1, end - start);

  // Pick which indices get classified as "referral" — evenly spaced
  // through the deal sequence (not clustered at the start).
  const referralIndices = new Set();
  for (let r = 0; r < referrals; r += 1) {
    const idx = Math.floor(((r + 0.5) * leads) / Math.max(1, referrals));
    referralIndices.add(idx);
  }

  for (let i = 0; i < leads; i += 1) {
    const fraction = leads === 1 ? 0.5 : i / (leads - 1);
    const t = start + Math.floor(fraction * span);
    deals.push({
      dealId: `${jobNumber}-L-${i + 1}`,
      jobNumber,
      campaignId,
      classification: referralIndices.has(i) ? "referral" : "lead",
      addTime: new Date(t).toISOString(),
    });
  }
  return deals;
}
