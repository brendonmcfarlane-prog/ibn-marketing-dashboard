import { fetchLeads } from "@/lib/leadsSheet";
import { readSheetRange, hasGoogleCredentials } from "@/lib/sheets";
import { daysAgoIso, todayIso } from "@/lib/format";

const QUALIFIERS_BUILDER_COL = 2;     // Column C
const QUALIFIERS_POSTCODES_COL = 25;  // Column Z

/**
 * Aggressively normalises a builder name so format quirks don't break the join.
 * Lower-cases, strips non-alphanumeric, collapses whitespace, removes invisible
 * characters that sometimes hide in pasted spreadsheet cells.
 */
function normalise(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\u00a0/g, " ")    // non-breaking space
    .replace(/[\u200b-\u200f\ufeff]/g, "") // zero-width chars + BOM
    .replace(/[^a-z0-9 ]/g, " ") // strip punctuation/symbols
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Bidirectional contains: lead name is a substring of qualifier OR vice versa.
 * Picks longest match on ties so "Simonds Homes" wins over "Homes" if both exist.
 */
function findBuilderEntry(leadName, qualifierEntries) {
  const leadNorm = normalise(leadName);
  if (!leadNorm) return null;
  let best = null;
  let bestLen = 0;
  for (const entry of qualifierEntries) {
    const qNorm = entry.norm;
    if (!qNorm) continue;
    let matchLen = 0;
    if (qNorm === leadNorm) matchLen = qNorm.length;
    else if (qNorm.includes(leadNorm)) matchLen = leadNorm.length;
    else if (leadNorm.includes(qNorm)) matchLen = qNorm.length;
    if (matchLen > bestLen) {
      best = entry;
      bestLen = matchLen;
    }
  }
  return best;
}

export default async function handler(req, res) {
  try {
    const since = isValidDate(req.query.since) ? req.query.since : daysAgoIso(29);
    const until = isValidDate(req.query.until) ? req.query.until : todayIso();

    if (!process.env.BUILDER_DETAILS_SHEET_ID) return res.status(200).json({ ok: false, reason: "BUILDER_DETAILS_SHEET_ID not set" });
    if (!hasGoogleCredentials()) return res.status(200).json({ ok: false, reason: "no Google credentials" });

    const range = process.env.BUILDER_DETAILS_SHEET_RANGE || "A1:AZ50000";
    let rows;
    try { rows = await readSheetRange(range, process.env.BUILDER_DETAILS_SHEET_ID); }
    catch (err) { return res.status(200).json({ ok: false, reason: "Qualifiers read failed", message: err.message }); }

    // Build entries: one per row { displayName, norm, postcodes: Set }
    // Aggregated: same normalised name across rows merges postcodes.
    const entriesByNorm = new Map();
    for (let i = 1; i < rows.length; i += 1) {
      const r = rows[i] || [];
      const builderRaw = String(r[QUALIFIERS_BUILDER_COL] || "").trim();
      const norm = normalise(builderRaw);
      if (!norm) continue;
      const cell = String(r[QUALIFIERS_POSTCODES_COL] || "").trim();
      if (!entriesByNorm.has(norm)) entriesByNorm.set(norm, { display: builderRaw, norm, postcodes: new Set() });
      const entry = entriesByNorm.get(norm);
      for (const raw of cell.split(/[,;\/\s]+/)) {
        const p = raw.trim();
        if (!/^\d{3,4}$/.test(p)) continue;
        entry.postcodes.add(p.padStart(4, "0"));
      }
    }
    const qualifierEntries = Array.from(entriesByNorm.values());

    // Fetch leads (already filtered to paid social with utm_campaign)
    const { leads } = await fetchLeads({ since, until });

    const tally = {
      totalLeadsConsidered: leads.length,
      withPostcode: 0,
      builderFoundInQualifiers: 0,
      builderNotInQualifiers: 0,
      postcodeInBuilderArea: 0,
      postcodeNotInBuilderArea: 0,
    };
    const matchedSamples = [];
    const builderMissingSamples = [];
    const postcodeMissSamples = [];

    for (const lead of leads) {
      const pc = String(lead.postCode || "").trim();
      if (!pc) continue;
      const pcNorm = pc.padStart(4, "0");
      if (!/^\d{4}$/.test(pcNorm)) continue;
      tally.withPostcode += 1;

      const entry = findBuilderEntry(lead.builderName, qualifierEntries);
      if (!entry) {
        tally.builderNotInQualifiers += 1;
        if (builderMissingSamples.length < 15) {
          builderMissingSamples.push({ leadBuilder: lead.builderName, normalisedAs: normalise(lead.builderName), postcode: pcNorm, campaign: lead.utmCampaign });
        }
        continue;
      }
      tally.builderFoundInQualifiers += 1;

      if (entry.postcodes.has(pcNorm)) {
        tally.postcodeInBuilderArea += 1;
        if (matchedSamples.length < 15) {
          matchedSamples.push({ leadBuilder: lead.builderName, matchedQualifier: entry.display, postcode: pcNorm, campaign: lead.utmCampaign });
        }
      } else {
        tally.postcodeNotInBuilderArea += 1;
        if (postcodeMissSamples.length < 15) {
          postcodeMissSamples.push({ leadBuilder: lead.builderName, matchedQualifier: entry.display, postcode: pcNorm, builderPostcodeCount: entry.postcodes.size, campaign: lead.utmCampaign });
        }
      }
    }

    // Diagnostic: first 10 RAW qualifier column C values (showing length so hidden chars stand out)
    const qualifierColCSamples = [];
    for (let i = 1; i < Math.min(rows.length, 11); i += 1) {
      const raw = String((rows[i] || [])[QUALIFIERS_BUILDER_COL] || "");
      qualifierColCSamples.push({ row: i + 1, raw, length: raw.length, normalised: normalise(raw) });
    }

    res.status(200).json({
      ok: true,
      range: { since, until },
      qualifiers: { rowsRead: Math.max(0, rows.length - 1), distinctBuilders: entriesByNorm.size },
      qualifierColCSamples,
      tally,
      matchedSamples,
      builderMissingSamples,
      postcodeMissSamples,
    });
  } catch (err) {
    console.error("[api/debug-builder-specific-match]", err);
    res.status(500).json({ error: err.message });
  }
}

function isValidDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
