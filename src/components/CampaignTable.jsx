import { formatCurrency, formatNumber } from "@/lib/format";

/**
 * Secondary table — spend by campaign, useful when Brendon has drilled
 * into a single builder/job. Shown below the builder rollup.
 */
export default function CampaignTable({ campaigns }) {
  if (!campaigns.length) {
    return null;
  }
  const total = campaigns.reduce((s, c) => s + (c.spend || 0), 0);
  const sorted = [...campaigns].sort((a, b) => (b.spend || 0) - (a.spend || 0));

  return (
    <section className="bg-white rounded-card shadow-card overflow-hidden mt-6">
      <header className="px-4 sm:px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ibn-navy">
          Campaign-level spend
        </h2>
        <span className="text-xs text-neutral-500">
          {sorted.length} {sorted.length === 1 ? "campaign" : "campaigns"} · {formatCurrency(total)} total
        </span>
      </header>

      <div className="overflow-x-auto scroll-shadow">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500 bg-neutral-50">
              <th className="px-4 py-2.5 font-semibold">Campaign</th>
              <th className="px-4 py-2.5 font-semibold">Platform</th>
              <th className="px-4 py-2.5 font-semibold">Job #</th>
              <th className="px-4 py-2.5 font-semibold text-right">Spend</th>
              <th className="px-4 py-2.5 font-semibold text-right">Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {sorted.map((c) => {
              const share = total > 0 ? (c.spend || 0) / total : 0;
              return (
                <tr key={c.campaignId} className="hover:bg-neutral-50">
                  <td className="px-4 py-2.5 text-ibn-navy">{c.campaignName}</td>
                  <td className="px-4 py-2.5 text-neutral-700 capitalize">
                    {c.platform}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-700 tabular-nums">
                    {c.jobNumber || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatCurrency(c.spend)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <ShareBar value={share} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ShareBar({ value }) {
  const widthPct = Math.min(Math.max(value, 0), 1) * 100;
  return (
    <div className="inline-flex items-center gap-2">
      <div className="w-20 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
        <div className="h-full bg-ibn-blue" style={{ width: `${widthPct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-neutral-700">
        {(value * 100).toFixed(1)}%
      </span>
    </div>
  );
}
