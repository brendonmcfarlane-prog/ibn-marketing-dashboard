/**
 * Referrals reader — reads the "All Contacts" tab on a separate Google
 * spreadsheet (REFERRALS_SHEET_ID). Each row is one referral.
 *
 * Columns are resolved by HEADER NAME first (robust against column
 * reordering or hidden/empty columns), with column-letter fallback for
 * the four load-bearing columns in case a header gets renamed:
 *   Attributed Date    → the referral date (windowing, pacing)
 *   Job Number         → attributes referral to a WIP builder contract
 *   RPL                → per-referral revenue (drives Revenue/ROMS)
 *   Lead Return Reason → ONLY count rows where this cell is BLANK. Any
 *                        value here means the builder returned the
 *                        referral and it should not count.
 *
 * Shape returned: deals-like, so the aggregator can treat referrals
 * alongside Pipedrive lead-deals with zero special-casing:
 *   [{ dealId, jobNumber, classification: "referral", addTime, revenue }]
 *
 * Falls back to mock data when env is not configured or the service
 * account can't see the sheet.
 */

import { readSheetRange, shouldUseSheetsMockFor } from "./sheets";
import { MOCK_REFERRALS } from "./mockData";

const DEFAULT_RANGE = "'All Contacts'!A1:AS100000";

// Column-letter fallbacks (1-indexed positions converted to 0-indexed).
// These match the letters Brendon confirmed (I, W, X, Y) and are only
// used if the header-name lookup fails.
const FALLBACK_COL_DATE = 8;   // I
const FALLBACK_COL_JOB = 22;   // W
const FALLBACK_COL_RPL = 23;   // X
const FALLBACK_COL_RETURN_REASON = 24; // Y

let _logged = false;

/**
 * Fetch referral rows for the given date window. `since`/`until` are
 * yyyy-mm-dd strings. If omitted, returns everything up to a wide
 * 365-day window so the aggregator's pacing calcs have enough data.
 */
export async function fetchReferrals({ since, until } = {}) {
  if (shouldUseSheetsMockFor("REFERRALS_SHEET_ID")) {
    return { source: "mock", referrals: MOCK_REFERRALS };
  }

  const range = process.env.REFERRALS_SHEET_RANGE || DEFAULT_RANGE;
  const sheetId = process.env.REFERRALS_SHEET_ID;
  const rows = await readSheetRange(range, sheetId);

  if (rows.length < 2) {
    return { source: "live", referrals: [] };
  }

  const headers = rows[0].map((h) => String(h || "").trim().toLowerCase());

  // Header-name lookup is authoritative. Column-letter fallback kicks in
  // only if the header name is missing or renamed.
  const idxDate = resolveIdx(headers, FALLBACK_COL_DATE, [
    "attributed date",
    "created date",
    "assigned date",
    "date",
  ]);
  const idxJob = resolveIdx(headers, FALLBACK_COL_JOB, [
    "job number",
    "jobnumber",
    "job #",
    "job",
  ]);
  const idxRpl = resolveIdx(headers, FALLBACK_COL_RPL, [
    "rpl",
    "revenue",
  ]);
  const idxReturnReason = resolveIdx(headers, FALLBACK_COL_RETURN_REASON, [
    "lead return reason",
    "return reason",
  ]);

  // One-time server-side diagnostic so misdetections are visible in the
  // dev-server log. `node` suppresses the log after the first request.
  if (!_logged) {
    _logged = true;
    // eslint-disable-next-line no-console
    console.log(
      "[referrals] column detection → date=%s (%s) job=%s (%s) rpl=%s (%s) returnReason=%s (%s). Total rows=%d",
      idxDate,
      headers[idxDate] ?? "(none)",
      idxJob,
      headers[idxJob] ?? "(none)",
      idxRpl,
      headers[idxRpl] ?? "(none)",
      idxReturnReason,
      headers[idxReturnReason] ?? "(none)",
      rows.length - 1
    );
  }

  const referrals = [];
  let skippedReturned = 0;
  let skippedNoJob = 0;
  let skippedNoDate = 0;
  const unparseableSamples = [];
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i] || [];

    // Filter: skip referrals that were returned (any non-blank value in
    // the Lead Return Reason column means the builder rejected them).
    const returnReason = String(r[idxReturnReason] || "").trim();
    if (returnReason) {
      skippedReturned += 1;
      continue;
    }

    const jobNumber = String(r[idxJob] || "").trim();
    if (!jobNumber) {
      skippedNoJob += 1;
      continue; // unattributable — can't map to a builder
    }

    const rawDate = r[idxDate];
    const addTime = normaliseDate(rawDate);
    if (!addTime) {
      skippedNoDate += 1;
      // Capture a small sample of unparseable raw values so we can
      // see what formats the parser is missing.
      if (unparseableSamples.length < 10) {
        unparseableSamples.push({
          row: i + 1,
          raw: rawDate,
          type: typeof rawDate,
        });
      }
    }

    const revenue = parseMoney(r[idxRpl]);

    referrals.push({
      dealId: `ref-row-${i}`,
      jobNumber,
      campaignId: null,
      classification: "referral",
      addTime,
      revenue,
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    "[referrals] kept=%d  skippedReturned=%d  skippedNoJob=%d  unparseableDate=%d",
    referrals.length,
    skippedReturned,
    skippedNoJob,
    skippedNoDate
  );
  if (unparseableSamples.length > 0) {
    // eslint-disable-next-line no-console
    console.log(
      "[referrals] unparseable date samples (row, raw, type):",
      unparseableSamples
    );
  }

  return { source: "live", referrals };
}

/**
 * Header-name lookup is primary; column-letter fallback is secondary.
 * This handles sheets where the column letters differ from expected
 * (e.g. extra/hidden columns between the named headers).
 */
function resolveIdx(headers, fallbackCol, candidates) {
  for (const cand of candidates) {
    const idx = headers.indexOf(cand.toLowerCase());
    if (idx >= 0) return idx;
  }
  return fallbackCol;
}

function parseMoney(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[$,\s]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Coerce a sheet date into yyyy-mm-dd. Accepts:
 *   - Google Sheets serial numbers (days since 1899-12-30)
 *   - ISO yyyy-mm-dd
 *   - Australian dd/mm/yyyy or dd-mm-yyyy (2 or 4 digit year)
 *   - ISO with time (yyyy-mm-ddThh:mm:ssZ)
 *   - "23 Apr 2026" / "23 April 2026"
 *   - Anything Date can parse as a final fallback
 * Returns null on failure.
 */
function normaliseDate(v) {
  if (v === null || v === undefined || v === "") return null;

  // Google Sheets serial number (the API returns a raw number if the cell
  // format isn't set to a date format). Excel/Sheets epoch is 1899-12-30.
  if (typeof v === "number" && Number.isFinite(v)) {
    return serialToIso(v);
  }

  const s = String(v).trim();
  if (!s) return null;

  // String that's actually a number (e.g. "46200") — treat as serial.
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    // Only interpret as a serial if it's in the plausible date range
    // (roughly 1970 → 2100). Avoids misreading small counts as dates.
    if (n >= 25569 && n <= 73050) {
      return serialToIso(n);
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);

  // Australian dd/mm/yyyy or dd-mm-yyyy, with optional trailing time.
  // Pipedrive exports often carry a hh:mm:ss suffix e.g. "17/12/2025 15:45:00".
  const auMatch = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})(?:[T ].*)?$/);
  if (auMatch) {
    const [, dd, mm, yy] = auMatch;
    const year = yy.length === 2 ? `20${yy}` : yy;
    return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Convert a Google Sheets / Excel serial number to yyyy-mm-dd.
 * 25569 corresponds to 1970-01-01 (the unix epoch), so subtracting it
 * and multiplying by day-milliseconds gives a JS Date.
 */
function serialToIso(serial) {
  const ms = (serial - 25569) * 86400000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
