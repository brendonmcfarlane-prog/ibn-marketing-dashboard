import { fetchLeads } from "@/lib/leadsSheet";
import { readSheetRange, hasGoogleCredentials } from "@/lib/sheets";
import { daysAgoIso, todayIso } from "@/lib/format";

const QUALIFIERS_BUILDER_COL = 2;     // Column C
const QUALIFIERS_POSTCODES_COL = 25;  // Column Z

const STATE_SUFFIX_REGEX = /\s*-\s*(vic|nsw|qld|sa|wa|tas|nt|act)\s*$/;
const BRAND_PREFIX_REGEX = /^(hs|ibn|sg)_/;

function normaliseBuilder(s) {
  let v = String(s || "")
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200f\ufeff]/g, "")
    .trim();
  v = v.replace(BRAND_PREFIX_REGEX, "");
  v = v.replace(STATE_SUFFIX_REGEX, "");
  v = v.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return v;
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

    // Merge rows by normalised base builder name (strip brand prefix + state suffix).
    const byBase = new Map();
    for (let i = 1; i < rows.length; i += 1) {
      const r = rows[i] || [];
      const builderRaw = String(r[QUALIFIERS_BUILDER_COL] || "").trim();
      const norm = normaliseBuilder(builderRaw);
      if (!norm) continue;
      const cell = String(r[QUALIFIERS_POSTCODES_COL] || "").trim();
      if (!byBase.has(norm)) byBase.set(norm, { norm, displays: [], postcodes: new Set(), rowCount: 0 });
      const entry = byBase.get(norm);
      entry.displays.push(builderRaw);
      entry.rowCount += 1;
      for (const raw of cell.split(/[,;\/\s]+/)) {
        const p = raw.trim();
        if (!/^\d{3,4}$/.test(p)) continue;
        entry.postcodes.add(p.padStart(4, "0"));
      }
    }
    const entries = Array.from(byBase.values());

    function findEntry(leadBuilderName) {
      const leadNorm = normaliseBuilder(leadBuilderName);
      if (!leadNorm) return null;
      if (byBase.has(leadNorm)) return byBase.get(leadNorm);
      // Contains fallback for any builder that doesn't fit the strip pattern.
      let best = null; let bestLen = 0;
      for (const e of entries) {
        let l = 0;
        if (e.norm === leadNorm) l = e.norm.length;
        else if (e.norm.includes(leadNorm)) l = leadNorm.length;
        else if (leadNorm.includes(e.norm)) l = e.norm.length;
        if (l > bestLen) { best = e; bestLen = l; }
      }
      return best;
    }

    const { leads } = await fetchLeads({ since, until });
    const tally = { totalLeadsConsidered: leads.length, withPostcode: 0, builderFound: 0, builderNotFound: 0, postcodeInBuilderArea: 0, postcodeNotInBuilderArea: 0 };
    const matchedSamples = []; const builderMissingSamples = []; const postcodeMissSamples = [];

    for (const lead of leads) {
      const pc = String(lead.postCode || "").trim();
      if (!pc) continue;
      const pcNorm = pc.padStart(4, "0");
      if (!/^\d{4}$/.test(pcNorm)) continue;
      tally.withPostcode += 1;

      const entry = findEntry(lead.builderName);
      if (!entry) {
        tally.builderNotFound += 1;
        if (builderMissingSamples.length < 15) builderMissingSamples.push({ leadBuilder: lead.builderName, postcode: pcNorm, campaign: lead.utmCampaign });
        continue;
      }
      tally.builderFound += 1;
      if (entry.postcodes.has(pcNorm)) {
        tally.postcodeInBuilderArea += 1;
        if (matchedSamples.length < 15) matchedSamples.push({ leadBuilder: lead.builderName, mergedFrom: entry.displays, postcode: pcNorm, campaign: lead.utmCampaign });
      } else {
        tally.postcodeNotInBuilderArea += 1;
        if (postcodeMissSamples.length < 15) postcodeMissSamples.push({ leadBuilder: lead.builderName, mergedFrom: entry.displays, postcode: pcNorm, builderPostcodeCount: entry.postcodes.size, campaign: lead.utmCampaign });
      }
    }

    res.status(200).json({
      ok: true,
      range: { since, until },
      qualifiers: { rowsRead: Math.max(0, rows.length - 1), distinctMergedBuilders: byBase.size, sampleMerges: entries.filter((e) => e.rowCount > 1).slice(0, 10).map((e) => ({ baseName: e.norm, rowCount: e.rowCount, mergedFrom: e.displays, totalPostcodes: e.postcodes.size })) },
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
