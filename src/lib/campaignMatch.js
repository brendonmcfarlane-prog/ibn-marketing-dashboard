/**
 * Match a utm_campaign value back to a Meta campaign.
 *
 * Strategy (two-stage, falls through):
 *   1. Suffix match on the full campaign name. Works when the leads
 *      sheet's UTM was captured AFTER the campaign got its current name.
 *   2. Job-number match. Falls back when the campaign was renamed in Meta
 *      since the lead was captured (e.g., "- Website" suffix added later).
 *      The UTM is frozen at click-time, but the spend sheet shows current
 *      names — so suffix-match fails. Job numbers are stable across
 *      renames so they're a more reliable join key in practice.
 *
 * The job-number regex is the same one in meta.js (extractJobNumberFromName)
 * — anchored to find HS524, SG09800, IBN-2145, plus optional bracket
 * suffixes like [1] / [LA] / [G][C].
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

  // Stage 1 — full-name suffix match (longest wins on ties).
  let best = null;
  let bestLen = 0;
  for (const c of campaigns) {
    const needle = normalise(c.campaignName);
    if (!needle) continue;
    if (haystack === needle || haystack.endsWith(needle)) {
      if (needle.length > bestLen) {
        best = c;
        bestLen = needle.length;
      }
    }
  }
  if (best) return best;

  // Stage 2 — job-number fallback. Robust to campaign renames.
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
