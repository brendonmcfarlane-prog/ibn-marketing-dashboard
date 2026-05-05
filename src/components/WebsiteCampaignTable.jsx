import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";

export default function WebsiteCampaignTable({ campaigns, showPostcodeMatch = false }) {
  if (!campaigns || campaigns.length === 0) {
    return (
      <section className="bg-white rounded-card shadow-card p-5 text-sm text-neutral-500">
        No Website-classified Meta campaigns in the selected date range.
      </section>
    );
  }

  const sorted = [...campaigns].sort((a, b) => (b.spend || 0) - (a.spend || 0));
  const totalSpend = sorted.reduce((s, c) => s + (c.spend || 0), 0);

  return (
    <section className="bg-white rounded-card shadow-card overflow-hidden">
      <header className="px-4 sm:px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ibn-navy">Campaign breakdown</h2>
        <span className="text-xs text-neutral-500">
          {sorted.length} {sorted.length === 1 ? "campaign" : "campaigns"} · {formatCurrency(totalSpend)} total
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500 bg-neutral-50">
              <th className="px-4 py-2.5 font-semibold">Campaign</th>
              <th className="px-4 py-2.5 font-semibold">Job #</th>
              <th className="px-4 py-2.5 font-semibold text-right">Spend</th>
              <th className="px-4 py-2.5 font-semibold text-right">Clicks</th>
              <th className="px-4 py-2.5 font-semibold text-right">Leads</th>
              {showPostcodeMatch && (
                <>
                  <th className="px-4 py-2.5 font-semibold text-right">Matched</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Match %</th>
                </>
              )}
              <th className="px-4 py-2.5 font-semibold text-right">Cost / Lead</th>
              <th className="px-4 py-2.5 font-semibold text-right">Conv. Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {sorted.map((c) => (
              <tr key={c.campaignId} className="hover:bg-neutral-50">
                <td className="px-4 py-2.5 text-ibn-navy">{c.campaignName || c.campaignId}</td>
                <td className="px-4 py-2.5 text-neutral-700 tabular-nums">{c.jobNumber || "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(c.spend)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(c.clicks)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(c.leads)}</td>
                {showPostcodeMatch && (
                  <>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(c.matched || 0)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {c.matchRate === null || c.matchRate === undefined ? "—" : formatPercent(c.matchRate, { decimals: 1 })}
                    </td>
                  </>
                )}
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {c.costPerLead === null || c.costPerLead === undefined ? "—" : formatCurrency(c.costPerLead)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {c.conversionRate === null || c.conversionRate === undefined ? "—" : formatPercent(c.conversionRate, { decimals: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
