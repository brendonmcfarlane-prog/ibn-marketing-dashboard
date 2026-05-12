import { readSheetRange, hasGoogleCredentials } from "./sheets";

const DEFAULT_RANGE = "A1:AZ50000";
const COL_BUILDER = 2;     // Column C
const COL_POSTCODES = 25;  // Column Z

const STATE_SUFFIX_REGEX = /\s*-\s*(vic|nsw|qld|sa|wa|tas|nt|act)\s*$/i;
const BRAND_PREFIX_REGEX = /^(hs|ibn|sg)_/i;

export function normaliseBuilder(s) {
  let v = String(s || "").toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200f\ufeff]/g, "")
    .trim();
  v = v.replace(BRAND_PREFIX_REGEX, "");
  v = v.replace(STATE_SUFFIX_REGEX, "");
  v = v.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return v;
}

const MOCK_POSTCODE_COUNTS = [
  ["3000", 3], ["3001", 2], ["3010", 2], ["3030", 1], ["3978", 1],
  ["2000", 2], ["2285", 1], ["2556", 1], ["4301", 1], ["4503", 1],
];
const MOCK_PER_BUILDER = [
  ["home group", ["3030", "3977", "3064", "3978"]],
  ["mimosa homes", ["3030"]],
  ["eden brae homes", ["2556", "2285", "2765", "2259"]],
  ["simonds homes", ["4301", "4503", "4506", "4054"]],
  ["ridgewater homes", ["3029", "3338", "3059", "3037", "3152"]],
  ["homesolution by metricon", ["3550", "3212"]],
];

function shouldUseMock() {
  if (process.env.USE_MOCK_DATA === "true") return true;
  if (!process.env.BUILDER_DETAILS_SHEET_ID) return true;
  return !hasGoogleCredentials();
}

export async function fetchBuilderPostcodeMap() {
  if (shouldUseMock()) {
    const per = new Map();
    for (const [name, pcs] of MOCK_PER_BUILDER) per.set(name, new Set(pcs.map((p) => p.padStart(4, "0"))));
    return { source: "mock", postcodeMap: new Map(MOCK_POSTCODE_COUNTS), perBuilderMap: per };
  }

  const range = process.env.BUILDER_DETAILS_SHEET_RANGE || DEFAULT_RANGE;
  const rows = await readSheetRange(range, process.env.BUILDER_DETAILS_SHEET_ID);

  const postcodeMap = new Map();
  const perBuilderMap = new Map();

  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i] || [];
    const baseName = normaliseBuilder(r[COL_BUILDER]);
    const cell = String(r[COL_POSTCODES] || "").trim();
    if (!cell) continue;
    const postcodes = [];
    for (const raw of cell.split(/[,;\/\s]+/)) {
      const p = raw.trim();
      if (!/^\d{3,4}$/.test(p)) continue;
      const norm = p.padStart(4, "0");
      postcodes.push(norm);
      postcodeMap.set(norm, (postcodeMap.get(norm) || 0) + 1);
    }
    if (baseName) {
      if (!perBuilderMap.has(baseName)) perBuilderMap.set(baseName, new Set());
      const set = perBuilderMap.get(baseName);
      for (const p of postcodes) set.add(p);
    }
  }

  return { source: "live", postcodeMap, perBuilderMap };
}

export function countMatchesForPostcode(postcodeMap, postcode, cap = 3) {
  if (!postcode) return 0;
  const norm = String(postcode).trim().padStart(4, "0");
  if (!/^\d{4}$/.test(norm)) return 0;
  return Math.min(postcodeMap.get(norm) || 0, cap);
}

export function strictMatchForLead(perBuilderMap, builderName, postcode) {
  if (!builderName || !postcode) return 0;
  const norm = String(postcode).trim().padStart(4, "0");
  if (!/^\d{4}$/.test(norm)) return 0;
  const baseName = normaliseBuilder(builderName);
  if (!baseName) return 0;
  const set = perBuilderMap.get(baseName);
  if (!set) return 0;
  return set.has(norm) ? 1 : 0;
}
