/**
 * Match a utm_campaign value back to a Meta or Google campaign.
 *
 * Strategy (three stages, falls through):
 *   0. Numeric-only UTM → match by campaign ID. Some Google Ads URL
 *      templates use {campaignid} instead of {campaign}, so the UTM
 *      value is the platform's numeric campaign ID. Direct ID match.
 *   1. Bidirectional substring match on campaign name (longest wins).
 *      Handles Meta's {{placement}}_{{campaign.name}} and Google's
 *      {{campaign.name}}_{{placement}} conventions.
 *   2. Job-number fallback. For renamed campaigns where the name in
 *      the UTM no longer matches the current campaign name, but the
 *      job number is stable.
 *
 * Caller must pre-filter campaigns to the lead's channel — channel
 * mixing is handled in /api/website-performance, not here.
 */

const JOB_NUMBER_REGEX = /([A-Z]{2,4}[-_]?\d{2,6}(?:\s*\[[^\]]+\])*)/i;

function normalise(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function extractJob(s) {
  if (!s) return null;
  const m = String(s).match(JOB_NUMBER_REGEX);
  if (!m) return null;
  return m[1].toLowerCase().replace(/\s+/g, " ").replace(/\s*\[/g, " [").trim();
}

export function matchLeadToCampaign(utmValue, campaigns) {
  if (!utmValue || !campaigns || campaigns.length === 0) return null;
  const raw = String(utmValue).trim();
  if (!raw) return null;

  // Stage 0 — numeric UTM = campaign ID match.
  if (/^\d+$/.test(raw)) {
    const byId = campaigns.find((c) => String(c.campaignId) === raw);
    if (byId) return byId;
  }

  // Stage 1 — substring match on campaign name (longest wins on ties).
  const haystack = normalise(raw);
  let best = null;
  let bestLen = 0;
  for (const c of campaigns) {
    const needle = normalise(c.campaignName);
    if (!needle) continue;
    if (haystack === needle || haystack.includes(needle)) {
      if (needle.length > bestLen) {
        best = c;
        bestLen = needle.length;
      }
    }
  }
  if (best) return best;

  // Stage 2 — job-number fallback.
  const utmJob = extractJob(raw);
  if (!utmJob) return null;
  for (const c of campaigns) {
    const campJob = extractJob(c.campaignName);
    if (campJob && campJob === utmJob) return c;
  }
  return null;
}

export function countLeadsByCampaign(leads, campaigns) {
  const counts = new Map();
  for (const lead of leads) {
    const m = matchLeadToCampaign(lead.utmCampaign, campaigns);
    if (!m) continue;
    counts.set(m.campaignId, (counts.get(m.campaignId) || 0) + 1);
  }
  return counts;
}
