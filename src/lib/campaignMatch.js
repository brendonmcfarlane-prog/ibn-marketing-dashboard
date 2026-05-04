/**
 * Match a utm_campaign value back to a Meta campaign name.
 *
 * Brendon's UTM convention (confirmed 2026-05-04):
 *
 *   {{placement}}_{{campaign.name}}
 *
 * So a leads-sheet row's Campaign column looks like:
 *
 *   "Facebook_Mobile_Feed_HS886 [1] - iBuildNew - Home Group - VIC - Website"
 *
 * …where the bare Meta campaign name is appended after the placement
 * token + underscore. Placements vary (Facebook_Stories, Instagram_Reels,
 * Audience_Network_Native, etc.), so we don't enumerate them — we just
 * suffix-match each Meta campaign name against the lead's UTM value and
 * pick the **longest** match on ties.
 *
 * Comparisons are case-insensitive and tolerant of whitespace inside
 * the value (collapses runs of whitespace to a single space).
 */

function normalise(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find the Meta campaign whose name is a suffix of `utmValue`.
 *
 * @param {string} utmValue                     The leads-sheet AB cell value.
 * @param {{ campaignId: string, campaignName: string }[]} campaigns  Meta campaigns to match against.
 * @returns {{ campaignId: string, campaignName: string } | null}     Best match, or null.
 */
export function matchLeadToCampaign(utmValue, campaigns) {
  if (!utmValue || !campaigns || campaigns.length === 0) return null;

  const haystack = normalise(utmValue);
  if (!haystack) return null;

  let best = null;
  let bestLen = 0;

  for (const c of campaigns) {
    const needle = normalise(c.campaignName);
    if (!needle) continue;

    // Exact equal, or appears as a suffix preceded by anything (the
    // placement token + underscore in the canonical case).
    if (haystack === needle || haystack.endsWith(needle)) {
      if (needle.length > bestLen) {
        best = c;
        bestLen = needle.length;
      }
    }
  }

  return best;
}

/**
 * Build a per-campaign lead count map for a list of leads.
 *
 * @param {{ utmCampaign: string }[]} leads
 * @param {{ campaignId: string, campaignName: string }[]} campaigns
 * @returns {Map<string, number>}    campaignId → leadCount
 */
export function countLeadsByCampaign(leads, campaigns) {
  const counts = new Map();
  for (const lead of leads) {
    const match = matchLeadToCampaign(lead.utmCampaign, campaigns);
    if (!match) continue;
    counts.set(match.campaignId, (counts.get(match.campaignId) || 0) + 1);
  }
  return counts;
}
