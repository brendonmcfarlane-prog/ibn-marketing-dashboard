import { formatCurrency, formatNumber } from "@/lib/format";
import { AD_TYPE_LEAD_ADS, adTypeLabel } from "@/lib/adType";

/**
 * Campaign-level breakdown — sorted by spend, with an ad-type chip per
 * row so you can spot which campaigns are pulling each side's averages.
 *
 * The campaigns array comes pre-sorted (descending spend) from the
 * /api/meta-comparison endpoint, but we sort defensively in case the
 * shape changes later.
 */
export default function AdTypeCampaignBreakdown({ campaigns }) {
  if (!campaigns || campaigns.length === 0) {
    return (
      <section className="bg-white rounded-card shadow-card p-5 mt-4 text-sm text-neutral-500">
        No Meta campaigns in the selected date range.
      </section>
    );
  }

  const sorted = [...campaigns].sort((a, b) => (b.spend || 0) - (a.spend || 0));
  const totalSpend = sorted.reduce((s, c) => s + (c.spend || 0), 0);

  return (
    <section className="bg-white rounded-card shadow-card overflow-hidden mt-4">
      <header className="px-4 sm:px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ibn-navy">
          Campaign breakdown
        </h2>
        <span className="text-xs text-neutral-500">
          {sorted.length} {sorted.length === 1 ? "campaign" : "campaigns"} ·{" "}
          {formatCurrency(totalSpend)} total
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500 bg-neutral-50">
              <th className="px-4 py-2.5 font-semibold">Campaign</th>
              <th className="px-4 py-2.5 font-semibold">Type</th>
              <th className="px-4 py-2.5 font-semibold">Job #</th>
              <th className="px-4 py-2.5 font-semibold text-right">Spend</th>
              <th className="px-4 py-2.5 font-semibold text-right">Leads</th>
              <th className="px-4 py-2.5 font-semibold text-right">Cost / Lead</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {sorted.map((c) => (
              <tr key={c.campaignId} className="hover:bg-neutral-50">
                <td className="px-4 py-2.5 text-ibn-navy">
                  {c.campaignName || c.campaignId}
                </td>
                <td className="px-4 py-2.5">
                  <AdTypeChip adType={c.adType} />
                </td>
                <td className="px-4 py-2.5 text-neutral-700 tabular-nums">
                  {c.jobNumber || "—"}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatCurrency(c.spend)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {formatNumber(c.leads)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {c.costPerLead === null || c.costPerLead === undefined
                    ? "—"
                    : formatCurrency(c.costPerLead)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AdTypeChip({ adType }) {
  const isLeadAds = adType === AD_TYPE_LEAD_ADS;
  const cls = isLeadAds
    ? "bg-ibn-orange/10 text-ibn-orange"
    : "bg-ibn-blue/10 text-ibn-blue";
  return (
    <span
      className={`inline-block text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${cls}`}
    >
      {adTypeLabel(adType)}
    </span>
  );
}
