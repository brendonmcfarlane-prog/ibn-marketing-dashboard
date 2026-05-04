import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";

/**
 * Five-up KPI strip for the Website Performance tab.
 * Numbers come pre-totalled from /api/website-performance.
 *
 * Conversion Rate = Leads / Clicks (per Brendon's definition 2026-05-04).
 * Both CPL and CVR will render em-dash when the denominator is zero.
 */
export default function WebsiteKpiStrip({ totals }) {
  if (!totals) return null;

  const cards = [
    { label: "Spend", value: formatCurrency(totals.spend) },
    { label: "Clicks", value: formatNumber(totals.clicks) },
    { label: "Leads", value: formatNumber(totals.leads) },
    {
      label: "Cost / Lead",
      value:
        totals.costPerLead === null || totals.costPerLead === undefined
          ? "—"
          : formatCurrency(totals.costPerLead),
    },
    {
      label: "Conversion Rate",
      value:
        totals.conversionRate === null || totals.conversionRate === undefined
          ? "—"
          : formatPercent(totals.conversionRate, { decimals: 2 }),
      sub: "Leads ÷ Clicks",
      accent: true,
    },
  ];

  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`rounded-card shadow-card p-4 ${
            c.accent ? "bg-ibn-navy text-white" : "bg-white"
          }`}
        >
          <div
            className={`text-[11px] uppercase tracking-wide mb-1 ${
              c.accent ? "text-white/70" : "text-neutral-500"
            }`}
          >
            {c.label}
          </div>
          <div
            className={`text-xl sm:text-2xl font-semibold tabular-nums leading-tight ${
              c.accent ? "" : "text-ibn-navy"
            }`}
          >
            {c.value}
          </div>
          {c.sub ? (
            <div
              className={`text-[11px] mt-1 ${
                c.accent ? "text-white/70" : "text-neutral-500"
              }`}
            >
              {c.sub}
            </div>
          ) : null}
        </div>
      ))}
    </section>
  );
}
