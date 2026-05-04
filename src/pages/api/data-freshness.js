import { readSheetRange, hasGoogleCredentials } from "@/lib/sheets";

export default async function handler(req, res) {
  try {
    if (!hasGoogleCredentials()) {
      return res.status(200).json({ source: "mock", spendLatest: null, leadsLatest: null });
    }
    const [spendLatest, leadsLatest] = await Promise.all([
      readSpendLatest().catch((e) => { console.error("[freshness/spend]", e.message); return null; }),
      readLeadsLatest().catch((e) => { console.error("[freshness/leads]", e.message); return null; }),
    ]);
    res.status(200).json({ source: "live", spendLatest, leadsLatest });
  } catch (err) {
    console.error("[api/data-freshness]", err);
    res.status(500).json({ error: err.message });
  }
}

async function readSpendLatest() {
  const range = process.env.META_SPEND_SHEET_RANGE || "'Data - Spend - IBN/HS'!A1:AZ50000";
  const rows = await readSheetRange(range);
  if (rows.length < 2) return null;
  const headers = rows[0].map((h) => String(h || "").trim().toLowerCase());
  const idxDate = findHeader(headers, ["report: date", "date formatted", "date"]);
  if (idxDate < 0) return null;
  let max = null;
  for (let i = 1; i < rows.length; i++) {
    const d = normaliseDate(rows[i] && rows[i][idxDate]);
    if (d && (!max || d > max)) max = d;
  }
  return max;
}

async function readLeadsLatest() {
  if (!process.env.LEADS_SHEET_ID) return null;
  const range = "'Leads Master - DB'!A1:A50000";
  const rows = await readSheetRange(range, process.env.LEADS_SHEET_ID);
  if (rows.length < 2) return null;
  let max = null;
  for (let i = 1; i < rows.length; i++) {
    const d = normaliseDate(rows[i] && rows[i][0]);
    if (d && (!max || d > max)) max = d;
  }
  return max;
}

function findHeader(headers, candidates) {
  for (const c of candidates) {
    const idx = headers.indexOf(c.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

function normaliseDate(v) {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const au = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (au) {
    const [, dd, mm, yy] = au;
    const year = yy.length === 2 ? `20${yy}` : yy;
    return `${year}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}
