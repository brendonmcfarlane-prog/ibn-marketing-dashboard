/**
 * Ad-type classification for Meta campaigns.
 *
 * Rule (confirmed with Brendon 2026-04-28):
 *   Campaign name contains the word "Website" (case-insensitive)  →  Website
 *   Anything else                                                  →  Lead Ads
 *
 * The "Website" token is part of the IBN/Homeshelf Meta naming convention
 * — Lead Ads campaigns are the default and don't carry a token, while
 * traffic-to-site campaigns include "Website" somewhere in the name
 * (e.g. "IBN-2172 Simonds Website Prospecting VIC").
 *
 * If the rule ever needs to expand (e.g. a new "Conversions" objective
 * label, or a separate column on the spend sheet), update this single
 * file — every consumer reads through `classifyAdType`.
 */

export const AD_TYPE_LEAD_ADS = "lead-ads";
export const AD_TYPE_WEBSITE = "website";

const WEBSITE_TOKEN_REGEX = /\bwebsite\b/i;

/**
 * Classify a Meta campaign name into an ad type.
 *
 * @param {string} campaignName  Campaign name as it appears in the spend sheet.
 * @returns {"lead-ads" | "website"}
 */
export function classifyAdType(campaignName) {
  if (!campaignName) return AD_TYPE_LEAD_ADS;
  return WEBSITE_TOKEN_REGEX.test(String(campaignName))
    ? AD_TYPE_WEBSITE
    : AD_TYPE_LEAD_ADS;
}

/**
 * Human label for an ad type — used by UI components.
 */
export function adTypeLabel(adType) {
  switch (adType) {
    case AD_TYPE_LEAD_ADS:
      return "Lead Ads";
    case AD_TYPE_WEBSITE:
      return "Website";
    default:
      return "Other";
  }
}
