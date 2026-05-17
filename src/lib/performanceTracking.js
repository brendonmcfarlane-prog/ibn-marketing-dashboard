import { readSheetRange, hasGoogleCredentials } from "./sheets";

const DEFAULT_RANGE = "'WIP Consolidated'!A1:Z5000";
const COL_JOB = 1;     // Column B — adjust if your sheet uses different
const COL_RPL = 6;     // Column G — Current Revenue Per Lead

const MOCK_DATA = [
  { job: "HS905 [1]", rpl: 110 },
  { job: "HS927 [5]", rpl: 110 },
  { job: "HS19 [1]", rpl: 160 },
  { job: "HS886 [1]", rpl: 100 },
  { job: "HS559 [1]", rpl: 115 },
  { job: "HS922 [3]", rpl: 120 },
  { job: "HS571 [1]", rpl: 120 },
];

let _loggedOnce = false;

function shouldUseMock() {
  if (process.env.USE_MOCK_DATA === "true") return true;
  if (!process.env.PERFORMANCE_TRACKING_SHEET_ID) return true;
  return !hasGoogleCredentials();
}

function normaliseJob(s) { return String(s || "").toLowerCase().replace(/\s+/g, " ").trim(); }

export async function fetchCurrentRevenuePerLead() {
  if (shouldUseMock()) {
    const map = new Map();
    for (const { job, rpl } of MOCK_DATA) map.set(normaliseJob(job), rpl);
    return { source: "mock", rplMap: map };
  }
  const range = process.env.PERFORMANCE_TRACKING_RANGE || DEFAULT_RANGE;
  const rows = await readSheetRange(range, process.env.PERFORMANCE_TRACKING_SHEET_ID);
  const map = new Map();
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i] || [];
    const job = String(r[COL_JOB] || "").trim();
    const rplRaw = String(r[COL_RPL] || "").trim();
    if (!job || !rplRaw) continue;
    const rpl = parseFloat(rplRaw.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(rpl)) continue;
    map.set(normaliseJob(job), rpl);
  }
  if (!_loggedOnce) {
    _loggedOnce = true;
    console.log("[performance-tracking] loaded %d RPL entries", map.size);
  }
  return { source: "live", rplMap: map };
}

export function lookupRpl(rplMap, jobNumber) {
  if (!jobNumber) return null;
  const key = normaliseJob(jobNumber);
  if (rplMap.has(key)) return rplMap.get(key);
  // Strip bracket suffix as fallback (e.g. "HS905 [1]" -> "HS905")
  const stripped = key.replace(/\s*\[[^\]]+\].*$/, "").trim();
  if (rplMap.has(stripped)) return rplMap.get(stripped);
  return null;
}
