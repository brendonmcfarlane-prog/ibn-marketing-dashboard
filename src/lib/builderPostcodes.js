import { readSheetRange, hasGoogleCredentials } from "./sheets";

/**
 * Reads the Builder Details sheet (column Z = comma-separated post codes)
 * and returns a Map<postcode, count> where count is how many builder rows
 * include that post code. Used by Website Performance to flag leads landing
 * in any builder's service area as "Referral Matched Leads" (cap 3 per lead).
 *
 * Brendon's call (2026-05-05): match leads against the WHOLE builder list,
 * not just the builder for the lead's specific campaign. A postcode that
 * appears on multiple builder rows counts multiple matches up to a cap of 3.
 */

const DEFAULT_RANGE = "A1:AZ50000";
const COL_POSTCODES = 25; // Column Z (A=0)

const MOCK_POSTCODE_MAP_DATA = [
  ["3000", 3], ["3001", 2], ["3002", 1], ["3003", 1],
  ["3004", 1], ["3008", 2], ["3010", 2], ["3011", 1],
  ["3020", 1], ["3030", 1], ["3040", 1], ["3070", 1],
  ["3100", 1], ["3150", 1], ["3175", 1], ["3199", 1],
  ["2000", 2], ["2010", 1], ["2020", 1], ["2030", 1],
];

let _loggedOnce = false;

function shouldUseMock() {
  if (process.env.USE_MOCK_DATA === "true") return true;
  if (!process.env.BUILDER_DETAILS_SHEET_ID) return true;
  return !hasGoogleCredentials();
}

export async function fetchBuilderPostcodeMap() {
  if (shouldUseMock()) {
    return { source: "mock", postcodeMap: new Map(MOCK_POSTCODE_MAP_DATA) };
  }
  const range = process.env.BUILDER_DETAILS_SHEET_RANGE || DEFAULT_RANGE;
  const rows = await readSheetRange(range, process.env.BUILDER_DETAILS_SHEET_ID);
  const map = new Map();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const cell = String(r[COL_POSTCODES] || "").trim();
    if (!cell) continue;
    for (const raw of cell.split(/[,;\/\s]+/)) {
      const p = raw.trim();
      if (!/^\d{3,4}$/.test(p)) continue;
      const norm = p.padStart(4, "0");
      map.set(norm, (map.get(norm) || 0) + 1);
    }
  }
  if (!_loggedOnce) {
    _loggedOnce = true;
    console.log("[builder-postcodes] %d distinct post codes from %d rows", map.size, Math.max(0, rows.length - 1));
  }
  return { source: "live", postcodeMap: map };
}

/**
 * Look up a single lead post code against the builder postcode map.
 * Returns 0..cap matches. cap default = 3 per Brendon's spec.
 */
export function countMatchesForPostcode(postcodeMap, postcode, cap = 3) {
  if (!postcode) return 0;
  const norm = String(postcode).trim().padStart(4, "0");
  if (!/^\d{4}$/.test(norm)) return 0;
  const count = postcodeMap.get(norm) || 0;
  return Math.min(count, cap);
}
