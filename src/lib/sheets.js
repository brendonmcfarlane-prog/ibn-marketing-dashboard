/**
 * Google Sheets — WIP contracts reader.
 *
 * Reads the "WIP" sheet used by the IBN paid media team. Each row is one
 * builder contract. Expected columns (first row = headers):
 *
 *   Job Number | Builder Name | Revenue Per Referred Lead | Total Lead Target
 *   | Contract Start Date | Contract End Date | [anything else]
 *
 * Column order is tolerant — we look up by header name, not position,
 * so additional columns on the sheet won't break the dashboard.
 *
 * Falls back to mock data when env is not configured.
 */

import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { MOCK_WIP_CONTRACTS } from "./mockData";

/**
 * Service-account credentials can be supplied two ways:
 *
 *   1. GOOGLE_SERVICE_ACCOUNT_JSON — the raw contents of the key file
 *      pasted into a single env var. Used in production (Vercel) because
 *      there's no persistent filesystem for secrets.
 *
 *   2. GOOGLE_SERVICE_ACCOUNT_FILE — a relative path to the JSON key file
 *      on disk. Used for local dev so we don't have to juggle multi-line
 *      env vars on a laptop.
 *
 * JSON takes precedence when both are set.
 */
export function hasGoogleCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return true;
  const credsPath = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (!credsPath) return false;
  const abs = path.resolve(process.cwd(), credsPath);
  return fs.existsSync(abs);
}

let _credsLoggedOnce = false;

function buildGoogleAuth() {
  const scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"];
  const jsonRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (jsonRaw) {
    let parsed;
    try {
      parsed = JSON.parse(jsonRaw);
    } catch (err) {
      throw new Error(
        `GOOGLE_SERVICE_ACCOUNT_JSON is set but is not valid JSON: ${err.message}`
      );
    }
    // Vercel's env var UI preserves newlines correctly, but if the key
    // ever gets copied through a tool that escaped newlines as "\n",
    // restore them here so the auth library can parse the private key.
    if (parsed.private_key && typeof parsed.private_key === "string") {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    if (!_credsLoggedOnce) {
      _credsLoggedOnce = true;
      // eslint-disable-next-line no-console
      console.log(
        "[sheets] auth source = GOOGLE_SERVICE_ACCOUNT_JSON (client_email=%s)",
        parsed.client_email || "(unknown)"
      );
    }
    return new google.auth.GoogleAuth({ credentials: parsed, scopes });
  }

  const credsPath = path.resolve(
    process.cwd(),
    process.env.GOOGLE_SERVICE_ACCOUNT_FILE || ""
  );
  if (!_credsLoggedOnce) {
    _credsLoggedOnce = true;
    // eslint-disable-next-line no-console
    console.log("[sheets] auth source = key file (%s)", credsPath);
  }
  return new google.auth.GoogleAuth({ keyFile: credsPath, scopes });
}

export function shouldUseSheetsMock() {
  if (process.env.USE_MOCK_DATA === "true") return true;
  if (!process.env.WIP_SHEET_ID) return true;
  return !hasGoogleCredentials();
}

/**
 * Generic Google Sheets range reader. Reuses the single service-account
 * so any sheet shared with it is readable — the Meta-spend tab, the WIP
 * contracts tab, and the separate Referrals spreadsheet all use the same
 * credentials.
 *
 * `sheetId` defaults to WIP_SHEET_ID so existing call sites keep working.
 * Pass an explicit sheet ID (e.g. process.env.REFERRALS_SHEET_ID) when
 * targeting a different spreadsheet.
 */
export async function readSheetRange(range, sheetId = process.env.WIP_SHEET_ID) {
  const auth = buildGoogleAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });

  return resp.data.values || [];
}

/**
 * Mock-mode gate for sheets that live on a different spreadsheet than
 * the WIP sheet (e.g. the referrals sheet). Pass the env var name that
 * holds that sheet's ID.
 */
export function shouldUseSheetsMockFor(sheetIdEnvVar) {
  if (process.env.USE_MOCK_DATA === "true") return true;
  if (!process.env[sheetIdEnvVar]) return true;
  return !hasGoogleCredentials();
}

export async function fetchWipContracts() {
  if (shouldUseSheetsMock()) {
    return { source: "mock", contracts: MOCK_WIP_CONTRACTS };
  }

  const range = process.env.WIP_SHEET_RANGE || "Contracts!A1:H1000";
  const rows = await readSheetRange(range);
  if (rows.length < 2) {
    return { source: "live", contracts: [] };
  }

  const headers = rows[0].map((h) => String(h || "").trim().toLowerCase());
  // Header aliases accept multiple naming conventions so different teams'
  // WIP sheets plug in without renaming columns.
  const idxJob = findHeader(headers, [
    "job number",
    "jobnumber",
    "job no",
    "job #",
    "job",
  ]);
  const idxBuilder = findHeader(headers, [
    "builder name",
    "builder",
    "project",
    "org",
    "brand",
  ]);
  const idxRevenue = findHeader(headers, [
    "revenue per referred lead",
    "rev per referred lead",
    "revenue per lead",
    "rpl",
  ]);
  const idxTarget = findHeader(headers, [
    "total lead target",
    "lead target",
    "total target",
  ]);
  const idxStart = findHeader(headers, [
    "contract start date",
    "contract start",
    "start date",
    "campaign live date",
    "campaign start date",
    "campaign start",
    "live date",
  ]);
  const idxEnd = findHeader(headers, [
    "contract end date",
    "contract end",
    "end date",
    "campaign end date",
    "campaign end",
  ]);
  const idxStatus = findHeader(headers, ["status"]);

  // Optional STATUS filter — env var is a comma-separated list of values
  // that mean "live/active". If unset, every row is included.
  const liveStatusValues = parseStatusValues(
    process.env.WIP_SHEET_STATUS_VALUES
  );

  const contracts = rows
    .slice(1)
    .map((r) => {
      const status = idxStatus >= 0 ? String(r[idxStatus] || "").trim() : "";
      return {
        jobNumber: idxJob >= 0 ? String(r[idxJob] || "").trim() : "",
        builderName: idxBuilder >= 0 ? String(r[idxBuilder] || "").trim() : "",
        revenuePerReferredLead:
          idxRevenue >= 0 ? parseMoney(r[idxRevenue]) : 0,
        totalLeadTarget:
          idxTarget >= 0 ? parseIntSafe(r[idxTarget]) : 0,
        contractStartDate: idxStart >= 0 ? parseDateIso(r[idxStart]) : null,
        contractEndDate: idxEnd >= 0 ? parseDateIso(r[idxEnd]) : null,
        status,
      };
    })
    .filter((c) => {
      if (!c.jobNumber) return false;
      if (liveStatusValues.length === 0) return true;
      return liveStatusValues.includes(c.status.toLowerCase());
    });

  return { source: "live", contracts };
}

function parseStatusValues(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function findHeader(headers, candidates) {
  for (const cand of candidates) {
    const idx = headers.indexOf(cand);
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseMoney(v) {
  if (typeof v === "number") return v;
  const s = String(v || "").replace(/[$,\s]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function parseIntSafe(v) {
  if (typeof v === "number") return Math.round(v);
  const n = parseInt(String(v || "").replace(/[,\s]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parse a date cell from Google Sheets into a yyyy-mm-dd string.
 * Handles ISO (yyyy-mm-dd), Australian dd/mm/yyyy, and dd-mm-yyyy. Returns
 * null on anything unparseable.
 */
function parseDateIso(v) {
  if (v === null || v === undefined || v === "") return null;

  const s = String(v).trim();

  // ISO yyyy-mm-dd (what Sheets returns if the cell is a DATE with ISO format)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Australian dd/mm/yyyy or dd-mm-yyyy
  const auMatch = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (auMatch) {
    const [, dd, mm, yy] = auMatch;
    const year = yy.length === 2 ? `20${yy}` : yy;
    return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  // Fallback: let Date parse and normalise.
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}
