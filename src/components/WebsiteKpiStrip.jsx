import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";

export default function WebsiteKpiStrip({ totals, showPostcodeMatch = false }) {
  if (!totals) return null;

  const cards = [
    { label: "Spend", value: formatCurrency(totals.spend) },
    { label: "Clicks", value: formatNumber(totals.clicks) },
    { label: "Leads", value: formatNumber(totals.leads) },
    {
      label: "Cost / Lead",
      value: totals.costPerLead === null || totals.costPerLead === undefined ? "—" : formatCurrency(totals.costPerLead),
    },
    {
      label: "Conversion Rate",
      value: totals.conversionRate === null || totals.conversionRate === undefined ? "—" : formatPercent(totals.conversionRate, { decimals: 2 }),
      sub: "Leads ÷ Clicks",
      accent: true,
    },
  ];

  if (showPostcodeMatch) {
    cards.push({
      label: "Referral Matched",
      value: formatNumber(totals.matched || 0),
      sub: totals.matchRate === null || totals.matchRate === undefined
        ? "no match data"
        : `${formatPercent(totals.matchRate, { decimals: 1 })} of leads in service area`,
    });
  }

  const cols = showPostcodeMatch ? "lg:grid-cols-6" : "lg:grid-cols-5";

  return (
    <section className={`grid grid-cols-2 sm:grid-cols-3 ${cols} gap-3 mb-6`}>
      {cards.map((c) => (
        <div key={c.label} className={`rounded-card shadow-card p-4 ${c.accent ? "bg-ibn-navy text-white" : "bg-white"}`}>
          <div className={`text-[11px] uppercase tracking-wide mb-1 ${c.accent ? "text-white/70" : "text-neutral-500"}`}>{c.label}</div>
          <div className={`text-xl sm:text-2xl font-semibold tabular-nums leading-tight ${c.accent ? "" : "text-ibn-navy"}`}>{c.value}</div>
          {c.sub ? <div className={`text-[11px] mt-1 ${c.accent ? "text-white/70" : "text-neutral-500"}`}>{c.sub}</div> : null}
        </div>
      ))}
    </section>
  );
}
