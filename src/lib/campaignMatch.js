/**
 * Match a utm_campaign value back to a Meta or Google campaign.
 *
 * Strategy (two-stage, falls through):
 *   1. Bidirectional substring match — longest wins. Handles both Meta's
 *      `{{placement}}_{{campaign.name}}` (campaign as suffix) and Google's
 *      `{{campaign.name}}_{{placement}}` (campaign as prefix), plus any
 *      case where the campaign name appears anywhere in the UTM.
 *   2. Job-number fallback. Falls back when the campaign was renamed in
 *      the ad platform since the lead was captured. Job numbers are stable
 *      across renames.
 *
 * Caller must pre-filter campaigns to the lead's channel — channel mixing
 * is handled in /api/website-performance, not here.
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
  const haystack = normalise(utmValue);
  if (!haystack) return null;

  // Stage 1 — substring match (longest wins on ties).
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
  const utmJob = extractJob(utmValue);
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
