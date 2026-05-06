import { fetchLeads } from "@/lib/leadsSheet";
import { readSheetRange, hasGoogleCredentials } from "@/lib/sheets";
import { daysAgoIso, todayIso } from "@/lib/format";

const QUALIFIERS_BUILDER_COL = 2;     // Column C in Builder Qualifiers
const QUALIFIERS_POSTCODES_COL = 25;  // Column Z in Builder Qualifiers

export default async function handler(req, res) {
  try {
    const since = isValidDate(req.query.since) ? req.query.since : daysAgoIso(29);
    const until = isValidDate(req.query.until) ? req.query.until : todayIso();

    if (!process.env.BUILDER_DETAILS_SHEET_ID) {
      return res.status(200).json({ ok: false, reason: "BUILDER_DETAILS_SHEET_ID not set" });
    }
    if (!hasGoogleCredentials()) {
      return res.status(200).json({ ok: false, reason: "no Google credentials" });
    }

    const range = process.env.BUILDER_DETAILS_SHEET_RANGE || "A1:AZ50000";
    let rows;
    try { rows = await readSheetRange(range, process.env.BUILDER_DETAILS_SHEET_ID); }
    catch (err) { return res.status(200).json({ ok: false, reason: "Qualifiers read failed", message: err.message }); }

    // Build builderName → Set of postcodes. Multiple rows per builder are unioned.
    const byBuilder = new Map();
    const builderRowCounts = new Map();
    for (let i = 1; i < rows.length; i += 1) {
      const r = rows[i] || [];
      const builderRaw = String(r[QUALIFIERS_BUILDER_COL] || "").trim();
      const builder = builderRaw.toLowerCase();
      const cell = String(r[QUALIFIERS_POSTCODES_COL] || "").trim();
      if (!builder) continue;
      builderRowCounts.set(builder, (builderRowCounts.get(builder) || 0) + 1);
      if (!byBuilder.has(builder)) byBuilder.set(builder, { display: builderRaw, postcodes: new Set() });
      const entry = byBuilder.get(builder);
      for (const raw of cell.split(/[,;\/\s]+/)) {
        const p = raw.trim();
        if (!/^\d{3,4}$/.test(p)) continue;
        entry.postcodes.add(p.padStart(4, "0"));
      }
    }

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
    const distinctLeadBuilders = new Map();

    for (const lead of leads) {
      const pc = String(lead.postCode || "").trim();
      if (!pc) continue;
      const norm = pc.padStart(4, "0");
      if (!/^\d{4}$/.test(norm)) continue;
      tally.withPostcode += 1;

      const builderRaw = String(lead.builderName || "").trim();
      const builderKey = builderRaw.toLowerCase();
      distinctLeadBuilders.set(builderKey, (distinctLeadBuilders.get(builderKey) || 0) + 1);

      const entry = byBuilder.get(builderKey);
      if (!entry) {
        tally.builderNotInQualifiers += 1;
        if (builderMissingSamples.length < 15) {
          builderMissingSamples.push({ leadBuilder: builderRaw, postcode: norm, campaign: lead.utmCampaign });
        }
        continue;
      }
      tally.builderFoundInQualifiers += 1;

      if (entry.postcodes.has(norm)) {
        tally.postcodeInBuilderArea += 1;
        if (matchedSamples.length < 15) {
          matchedSamples.push({ builder: entry.display, postcode: norm, campaign: lead.utmCampaign, builderPostcodeCount: entry.postcodes.size });
        }
      } else {
        tally.postcodeNotInBuilderArea += 1;
        if (postcodeMissSamples.length < 15) {
          postcodeMissSamples.push({ builder: entry.display, postcode: norm, campaign: lead.utmCampaign, builderPostcodeCount: entry.postcodes.size });
        }
      }
    }

    // Top distinct builder names in leads, with whether they're recognised in qualifiers
    const leadBuilderTable = Array.from(distinctLeadBuilders.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([key, count]) => ({
        leadBuilderName: key,
        leadCount: count,
        existsInQualifiers: byBuilder.has(key),
      }));

    res.status(200).json({
      ok: true,
      range: { since, until },
      qualifiers: {
        rowsRead: Math.max(0, rows.length - 1),
        distinctBuilders: byBuilder.size,
      },
      tally,
      leadBuilderTable,
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
